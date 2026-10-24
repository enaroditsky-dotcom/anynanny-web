import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  QUESTION_HISTORY_PAGE_SIZE,
  RESPONDENT_PAGE_SIZE,
  adminRoleLabel,
  audienceLabel,
  exactPublicId,
  isBroadcastQuestionId,
  pageBounds,
  pageOfIds,
  profileSerialMatches,
  respondentPageFromQuery,
  isUnsatisfiableRangeError,
  publicIdSearchTerm,
  questionFormatLabel,
  selectionModeLabel,
  summarizeQuestionResults,
  type QuestionOptionTally,
  type QuestionResultScope,
  type RespondentStatusFilter
} from "@/lib/admin/broadcast-question-results";
import type { BroadcastAudienceType } from "@/lib/admin/broadcast-audience";
import { pickProfilePublicId } from "@/lib/public/sequential-display-id";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";

const QUESTIONS = "broadcast_questions";
const OPTIONS = "broadcast_question_options";
const RECIPIENTS = "broadcast_question_recipients";
const RESPONSES = "broadcast_question_responses";
const PROFILES = "profiles";
/** Kept small so the follow-up profile id filter stays within a normal request URL. */
const RECIPIENT_SCAN_PAGE = 80;

/**
 * Respondent public ids are read only from profiles.parent_serial and profiles.nanny_serial.
 * parent_serial is created in 20260727120000_robust_sequential_public_serials.sql.
 * profiles.nanny_serial is the canonical sitter id used by 20261001110000_profiles_canonical_sitter_public_id.sql.
 * This repository comments on profiles.nanny_serial and does not contain an ALTER TABLE that adds it.
 * Before non-production testing, confirm both columns exist:
 *   select column_name from information_schema.columns
 *    where table_schema = 'public' and table_name = 'profiles'
 *      and column_name in ('parent_serial', 'nanny_serial');
 */

type QuestionRow = {
  id: string;
  created_at: string;
  closed_at: string | null;
  audience_type: string;
  question_format: string;
  selection_mode: string;
  prompt: string;
  is_test: boolean;
  selected_public_ids: string[] | null;
};

export type QuestionHistoryItem = QuestionRow & {
  audience_label: string;
  format_label: string;
  selection_label: string;
  recipients: number;
  respondents: number;
  response_rate: number;
};

export type RespondentRow = {
  role_label: string;
  parent_public_id: string | null;
  sitter_public_id: string | null;
  answers: string[];
  first_responded_at: string | null;
  last_responded_at: string | null;
  responded: boolean;
};

function client(): SupabaseClient {
  return getSupabaseServiceRoleClient();
}

async function exactCount(
  build: (supabase: SupabaseClient) => PromiseLike<{ count: number | null; error: { message: string } | null }>
): Promise<number> {
  const { count, error } = await build(client());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function snapshotCounts(questionId: string): Promise<{ recipients: number; respondents: number }> {
  const [recipients, respondents] = await Promise.all([
    exactCount((supabase) =>
      supabase.from(RECIPIENTS).select("user_id", { count: "exact", head: true }).eq("question_id", questionId)
    ),
    exactCount((supabase) =>
      supabase
        .from(RECIPIENTS)
        .select("user_id", { count: "exact", head: true })
        .eq("question_id", questionId)
        .not("first_responded_at", "is", null)
    )
  ]);
  return { recipients, respondents };
}

async function countBroadcastQuestionHistory(input: {
  scope: QuestionResultScope;
  audience: BroadcastAudienceType | null;
}): Promise<number> {
  let query = client()
    .from(QUESTIONS)
    .select("id", { count: "exact", head: true })
    .eq("is_test", input.scope === "test");
  if (input.audience) query = query.eq("audience_type", input.audience);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function listBroadcastQuestionHistory(input: {
  scope: QuestionResultScope;
  audience: BroadcastAudienceType | null;
  page: number;
}): Promise<{ questions: QuestionHistoryItem[]; page: number; pageSize: number; total: number }> {
  const bounds = pageBounds(input.page, QUESTION_HISTORY_PAGE_SIZE);
  let query = client()
    .from(QUESTIONS)
    .select(
      "id, created_at, closed_at, audience_type, question_format, selection_mode, prompt, is_test, selected_public_ids",
      {
        count: "exact"
      }
    )
    .eq("is_test", input.scope === "test")
    .order("created_at", { ascending: false })
    .range(bounds.from, bounds.to);
  if (input.audience) query = query.eq("audience_type", input.audience);

  const { data, error, count } = await query;
  const page = respondentPageFromQuery({
    data: (data ?? null) as QuestionRow[] | null,
    count,
    error,
    totalWhenUnsatisfiable:
      error && isUnsatisfiableRangeError(error) ? await countBroadcastQuestionHistory(input) : 0
  });
  if (page.error) throw new Error(page.error);
  const rows = page.rows;
  const questions = await Promise.all(
    rows.map(async (row) => {
      const counts = await snapshotCounts(row.id);
      const summary = summarizeQuestionResults({
        recipientCount: counts.recipients,
        respondentCount: counts.respondents,
        selectionMode: row.selection_mode === "multiple" ? "multiple" : "single",
        options: []
      });
      return {
        ...row,
        audience_label: audienceLabel(row.audience_type),
        format_label: questionFormatLabel(row.question_format),
        selection_label: selectionModeLabel(row.selection_mode),
        recipients: summary.recipients,
        respondents: summary.respondents,
        response_rate: summary.responseRate
      };
    })
  );
  return { questions, page: bounds.page, pageSize: QUESTION_HISTORY_PAGE_SIZE, total: page.total };
}

async function loadQuestion(questionId: string): Promise<QuestionRow | null> {
  const { data, error } = await client()
    .from(QUESTIONS)
    .select(
      "id, created_at, closed_at, audience_type, question_format, selection_mode, prompt, is_test, selected_public_ids"
    )
    .eq("id", questionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as QuestionRow | null) ?? null;
}

async function loadOptions(questionId: string): Promise<Array<{ id: string; label: string; position: number }>> {
  const { data, error } = await client()
    .from(OPTIONS)
    .select("id, label, position")
    .eq("question_id", questionId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string; label: string; position: number }>).map((option) => ({
    id: String(option.id),
    label: String(option.label),
    position: Number(option.position)
  }));
}

async function optionSelections(questionId: string, optionId: string): Promise<number> {
  return exactCount((supabase) =>
    supabase
      .from(RESPONSES)
      .select("option_id", { count: "exact", head: true })
      .eq("question_id", questionId)
      .eq("option_id", optionId)
  );
}

async function profileIdsForExactSerial(column: "parent_serial" | "nanny_serial", value: string): Promise<string[]> {
  const { data, error } = await client().from(PROFILES).select("id").ilike(column, value).limit(5);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id?: unknown }>)
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);
}

async function filterIdsBySerial(ids: string[], term: string): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await client()
    .from(PROFILES)
    .select("id, parent_serial, nanny_serial")
    .in("id", ids);
  if (error) throw new Error(error.message);
  const matched = new Set<string>();
  for (const row of data ?? []) {
    const record = row as { id?: unknown; parent_serial?: unknown; nanny_serial?: unknown };
    const id = String(record.id ?? "").trim();
    if (id && profileSerialMatches(record.parent_serial, record.nanny_serial, term)) matched.add(id);
  }
  return ids.filter((id) => matched.has(id));
}

async function scanMatchingRecipientIds(input: {
  questionId: string;
  term: string;
  status: RespondentStatusFilter;
  optionId: string | null;
}): Promise<string[]> {
  const exact = exactPublicId(input.term);
  const wanted = new Set<string>();
  if (exact) {
    for (const id of await profileIdsForExactSerial(exact.column, exact.value)) wanted.add(id);
  }
  if (isBroadcastQuestionId(input.term)) wanted.add(input.term);
  if (exact || isBroadcastQuestionId(input.term)) {
    if (wanted.size === 0) return [];
    let query = client()
      .from(input.optionId ? RESPONSES : RECIPIENTS)
      .select("user_id")
      .eq("question_id", input.questionId)
      .in("user_id", [...wanted]);
    if (!input.optionId && input.status === "responded") query = query.not("first_responded_at", "is", null);
    if (!input.optionId && input.status === "not_responded") query = query.is("first_responded_at", null);
    if (input.optionId) query = query.eq("option_id", input.optionId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return [
      ...new Set(
        ((data ?? []) as Array<{ user_id?: unknown }>)
          .map((row) => String(row.user_id ?? "").trim())
          .filter((id) => wanted.has(id))
      )
    ];
  }

  const matches: string[] = [];
  let from = 0;
  for (;;) {
    let query = client()
      .from(input.optionId ? RESPONSES : RECIPIENTS)
      .select("user_id")
      .eq("question_id", input.questionId)
      .order("user_id", { ascending: true })
      .range(from, from + RECIPIENT_SCAN_PAGE - 1);
    if (!input.optionId && input.status === "responded") query = query.not("first_responded_at", "is", null);
    if (!input.optionId && input.status === "not_responded") query = query.is("first_responded_at", null);
    if (input.optionId) query = query.eq("option_id", input.optionId);
    const { data, error } = await query;
    if (error && isUnsatisfiableRangeError(error)) break;
    if (error) throw new Error(error.message);
    const ids = ((data ?? []) as Array<{ user_id?: unknown }>)
      .map((row) => String(row.user_id ?? "").trim())
      .filter(Boolean);
    if (ids.length === 0) break;
    matches.push(...(await filterIdsBySerial(ids, input.term)));
    if (ids.length < RECIPIENT_SCAN_PAGE) break;
    from += RECIPIENT_SCAN_PAGE;
  }
  return [...new Set(matches)];
}

async function recipientRowsForIds(questionId: string, ids: string[]): Promise<RecipientRecord[]> {
  if (ids.length === 0) return [];
  const { data, error } = await client()
    .from(RECIPIENTS)
    .select("user_id, first_responded_at, last_responded_at")
    .eq("question_id", questionId)
    .in("user_id", ids);
  if (error) throw new Error(error.message);
  const byUser = new Map(
    ((data ?? []) as RecipientRecord[]).map((row) => [String(row.user_id), row])
  );
  return ids.map(
    (userId) => byUser.get(userId) ?? { user_id: userId, first_responded_at: null, last_responded_at: null }
  );
}

type RecipientRecord = {
  user_id: string;
  first_responded_at: string | null;
  last_responded_at: string | null;
};

async function countRecipientPage(input: {
  questionId: string;
  status: RespondentStatusFilter;
  optionId: string | null;
  userIds: string[] | null;
}): Promise<number> {
  if (input.optionId) {
    let picked = client()
      .from(RESPONSES)
      .select("user_id", { count: "exact", head: true })
      .eq("question_id", input.questionId)
      .eq("option_id", input.optionId);
    if (input.userIds) picked = picked.in("user_id", input.userIds);
    const { count, error } = await picked;
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  let query = client()
    .from(RECIPIENTS)
    .select("user_id", { count: "exact", head: true })
    .eq("question_id", input.questionId);
  if (input.status === "responded") query = query.not("first_responded_at", "is", null);
  if (input.status === "not_responded") query = query.is("first_responded_at", null);
  if (input.userIds) query = query.in("user_id", input.userIds);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function loadRecipientPage(input: {
  questionId: string;
  page: number;
  status: RespondentStatusFilter;
  optionId: string | null;
  userIds: string[] | null;
}): Promise<{ rows: RecipientRecord[]; total: number; page: number }> {
  const bounds = pageBounds(input.page, RESPONDENT_PAGE_SIZE);
  if (input.userIds && input.userIds.length === 0) {
    return { rows: [], total: 0, page: bounds.page };
  }

  if (input.optionId) {
    let picked = client()
      .from(RESPONSES)
      .select("user_id", { count: "exact" })
      .eq("question_id", input.questionId)
      .eq("option_id", input.optionId)
      .order("user_id", { ascending: true })
      .range(bounds.from, bounds.to);
    if (input.userIds) picked = picked.in("user_id", input.userIds);
    const { data, error, count } = await picked;
    const page = respondentPageFromQuery({
      data: (data ?? null) as Array<{ user_id?: unknown }> | null,
      count,
      error,
      totalWhenUnsatisfiable: error && isUnsatisfiableRangeError(error) ? await countRecipientPage(input) : 0
    });
    if (page.error) throw new Error(page.error);
    const userIds = page.rows.map((row) => String(row.user_id ?? "")).filter(Boolean);
    if (userIds.length === 0) return { rows: [], total: page.total, page: bounds.page };
    const { data: recipients, error: recipientError } = await client()
      .from(RECIPIENTS)
      .select("user_id, first_responded_at, last_responded_at")
      .eq("question_id", input.questionId)
      .in("user_id", userIds);
    if (recipientError) throw new Error(recipientError.message);
    const byUser = new Map(
      ((recipients ?? []) as RecipientRecord[]).map((row) => [String(row.user_id), row])
    );
    return {
      rows: userIds.map(
        (userId) => byUser.get(userId) ?? { user_id: userId, first_responded_at: null, last_responded_at: null }
      ),
      total: page.total,
      page: bounds.page
    };
  }

  let query = client()
    .from(RECIPIENTS)
    .select("user_id, first_responded_at, last_responded_at", { count: "exact" })
    .eq("question_id", input.questionId)
    .order("first_responded_at", { ascending: false, nullsFirst: false })
    .range(bounds.from, bounds.to);
  if (input.status === "responded") query = query.not("first_responded_at", "is", null);
  if (input.status === "not_responded") query = query.is("first_responded_at", null);
  if (input.userIds) query = query.in("user_id", input.userIds);
  const { data, error, count } = await query;
  const page = respondentPageFromQuery({
    data: (data ?? null) as RecipientRecord[] | null,
    count,
    error,
    totalWhenUnsatisfiable: error && isUnsatisfiableRangeError(error) ? await countRecipientPage(input) : 0
  });
  if (page.error) throw new Error(page.error);
  return { rows: page.rows, total: page.total, page: bounds.page };
}

export async function loadBroadcastQuestionResult(input: {
  questionId: string;
  page: number;
  status: RespondentStatusFilter;
  optionId: string | null;
  query: string | null;
}): Promise<{
  question: QuestionHistoryItem & {
    nonrespondents: number;
    percentages_may_exceed_100: boolean;
    closed: boolean;
  };
  options: QuestionOptionTally[];
  respondents: RespondentRow[];
  page: number;
  pageSize: number;
  total: number;
} | null> {
  const question = await loadQuestion(input.questionId);
  if (!question) return null;
  const options = await loadOptions(input.questionId);
  if (input.optionId && !options.some((option) => option.id === input.optionId)) {
    throw new Error("unknown option");
  }
  const counts = await snapshotCounts(input.questionId);
  const selections = await Promise.all(
    options.map(async (option) => ({
      ...option,
      selections: await optionSelections(input.questionId, option.id)
    }))
  );
  const summary = summarizeQuestionResults({
    recipientCount: counts.recipients,
    respondentCount: counts.respondents,
    selectionMode: question.selection_mode === "multiple" ? "multiple" : "single",
    options: selections
  });
  const page =
    input.optionId && input.status === "not_responded"
      ? { rows: [], total: 0, page: pageBounds(input.page, RESPONDENT_PAGE_SIZE).page }
      : input.query
        ? await (async () => {
            const matched = await scanMatchingRecipientIds({
              questionId: input.questionId,
              term: input.query as string,
              status: input.optionId ? "responded" : input.status,
              optionId: input.optionId
            });
            const window = pageOfIds(matched, input.page, RESPONDENT_PAGE_SIZE);
            return {
              rows: await recipientRowsForIds(input.questionId, window.ids),
              total: window.total,
              page: window.page
            };
          })()
        : await loadRecipientPage({
            questionId: input.questionId,
            page: input.page,
            status: input.optionId ? "responded" : input.status,
            optionId: input.optionId,
            userIds: null
          });
  const ids = page.rows.map((row) => row.user_id).filter(Boolean);
  const profiles = new Map<string, { role: unknown; parent_serial: unknown; nanny_serial: unknown }>();
  const answersByUser = new Map<string, string[]>();
  if (ids.length > 0) {
    const [profileResult, answerResult] = await Promise.all([
      client().from(PROFILES).select("id, role, parent_serial, nanny_serial").in("id", ids),
      client().from(RESPONSES).select("user_id, option_id").eq("question_id", input.questionId).in("user_id", ids)
    ]);
    if (profileResult.error) throw new Error(profileResult.error.message);
    if (answerResult.error) throw new Error(answerResult.error.message);
    for (const row of profileResult.data ?? []) {
      const record = row as { id?: unknown; role?: unknown; parent_serial?: unknown; nanny_serial?: unknown };
      profiles.set(String(record.id), {
        role: record.role,
        parent_serial: record.parent_serial,
        nanny_serial: record.nanny_serial
      });
    }
    const labelByOption = new Map(options.map((option) => [option.id, option.label]));
    for (const row of answerResult.data ?? []) {
      const record = row as { user_id?: unknown; option_id?: unknown };
      const userId = String(record.user_id ?? "");
      const optionId = String(record.option_id ?? "");
      const label = labelByOption.get(optionId);
      if (!userId || !label) continue;
      const current = answersByUser.get(userId) ?? [];
      current.push(label);
      answersByUser.set(userId, current);
    }
    for (const [userId, labels] of answersByUser) {
      const ordered = options.map((option) => option.label).filter((label) => labels.includes(label));
      answersByUser.set(userId, ordered);
    }
  }

  return {
    question: {
      ...question,
      audience_label: audienceLabel(question.audience_type),
      format_label: questionFormatLabel(question.question_format),
      selection_label: selectionModeLabel(question.selection_mode),
      recipients: summary.recipients,
      respondents: summary.respondents,
      nonrespondents: summary.nonrespondents,
      response_rate: summary.responseRate,
      percentages_may_exceed_100: summary.percentagesMayExceed100,
      closed: question.closed_at != null
    },
    options: summary.options,
    respondents: page.rows.map((row) => {
      const profile = profiles.get(row.user_id);
      return {
        role_label: adminRoleLabel(profile?.role),
        parent_public_id: pickProfilePublicId({ parent_serial: profile?.parent_serial }, "parent"),
        sitter_public_id: pickProfilePublicId({ nanny_serial: profile?.nanny_serial }, "sitter"),
        answers: answersByUser.get(row.user_id) ?? [],
        first_responded_at: row.first_responded_at,
        last_responded_at: row.last_responded_at,
        responded: row.first_responded_at != null
      };
    }),
    page: page.page,
    pageSize: RESPONDENT_PAGE_SIZE,
    total: page.total
  };
}

export async function closeBroadcastQuestion(questionId: string): Promise<{
  questionId: string;
  closedAt: string;
  alreadyClosed: boolean;
}> {
  const { data, error } = await client().rpc("admin_close_broadcast_question", {
    p_question_id: questionId
  });
  if (error) throw new Error(error.message);
  const row = data as { question_id?: unknown; closed_at?: unknown; already_closed?: unknown } | null;
  const closedAt = String(row?.closed_at ?? "").trim();
  if (!closedAt) throw new Error("close failed");
  return {
    questionId: String(row?.question_id ?? questionId),
    closedAt,
    alreadyClosed: row?.already_closed === true
  };
}
