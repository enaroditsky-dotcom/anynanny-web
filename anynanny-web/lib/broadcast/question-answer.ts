import type { SupabaseClient } from "@supabase/supabase-js";
import { publishBroadcastQuestionAnswered } from "@/lib/broadcast/question-link";
import { NOTIFICATIONS_TABLE } from "@/lib/chat/constants";
import { markNotificationsRead } from "@/lib/notifications/read-state";

export type BroadcastQuestionOption = {
  id: string;
  label: string;
  position: number;
};

export type BroadcastQuestionView = {
  id: string;
  prompt: string;
  questionFormat: "yes_no" | "custom";
  selectionMode: "single" | "multiple";
  closedAt: string | null;
  options: BroadcastQuestionOption[];
  selectedOptionIds: string[];
};

const SUBMIT_RPC = "submit_broadcast_question_response";

function asFormat(value: unknown): BroadcastQuestionView["questionFormat"] | null {
  return value === "yes_no" || value === "custom" ? value : null;
}

function asMode(value: unknown): BroadcastQuestionView["selectionMode"] | null {
  return value === "single" || value === "multiple" ? value : null;
}

export function broadcastQuestionSubmitMessage(error: { message?: string; code?: string } | null): string {
  const message = String(error?.message ?? "");
  if (error?.code === "42501" && /not authenticated/i.test(message)) return "יש להתחבר כדי לענות.";
  if (/question is closed/i.test(message)) return "השאלה נסגרה. אי אפשר לענות עוד.";
  if (/not a recipient/i.test(message)) return "השאלה לא זמינה עבורך.";
  if (/single-choice/i.test(message)) return "יש לבחור תשובה אחת.";
  if (/at least one option/i.test(message)) return "יש לבחור לפחות תשובה אחת.";
  if (/invalid option|duplicate option|too many options/i.test(message)) return "התשובה שנבחרה לא שייכת לשאלה.";
  if (/not authenticated/i.test(message)) return "יש להתחבר כדי לענות.";
  return "לא הצלחנו לשמור את התשובה. נסו שוב.";
}

function savedOptionIds(data: unknown, questionId: string): string[] | null {
  if (!data || typeof data !== "object") return null;
  const row = data as { question_id?: unknown; option_ids?: unknown };
  if (String(row.question_id ?? "").trim() !== questionId) return null;
  if (!Array.isArray(row.option_ids) || row.option_ids.length === 0) return null;
  const ids = row.option_ids.map((id) => String(id ?? "").trim()).filter(Boolean);
  return ids.length === row.option_ids.length ? ids : null;
}

/** Response rows are the source of truth. RLS returns only the signed-in user's answers. */
export async function fetchAnsweredBroadcastQuestionIds(
  supabase: SupabaseClient
): Promise<{ ids: Set<string>; error: string | null }> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { ids: new Set(), error: authError?.message || "not authenticated" };
  }

  const { data, error } = await supabase.from("broadcast_question_responses").select("question_id");
  if (error) return { ids: new Set(), error: error.message };

  const ids = new Set<string>();
  for (const row of data ?? []) {
    const id = String((row as { question_id?: unknown }).question_id ?? "").trim();
    if (id) ids.add(id);
  }
  return { ids, error: null };
}

/** null means the lookup failed. Callers must not show the question in that case. */
export async function userHasAnsweredBroadcastQuestion(
  supabase: SupabaseClient,
  questionId: string
): Promise<boolean | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return null;

  const { data, error } = await supabase
    .from("broadcast_question_responses")
    .select("question_id")
    .eq("question_id", questionId)
    .limit(1);
  if (error) return null;
  return (data ?? []).length > 0;
}

export async function loadBroadcastQuestionForCurrentUser(
  supabase: SupabaseClient,
  questionId: string
): Promise<{ ok: true; question: BroadcastQuestionView } | { ok: false; message: string }> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { ok: false, message: "יש להתחבר כדי לענות." };
  }

  const [{ data: question, error: questionError }, { data: options, error: optionsError }, { data: responses, error: responsesError }] =
    await Promise.all([
      supabase
        .from("broadcast_questions")
        .select("id, prompt, question_format, selection_mode, closed_at")
        .eq("id", questionId)
        .maybeSingle(),
      supabase
        .from("broadcast_question_options")
        .select("id, label, position")
        .eq("question_id", questionId)
        .order("position", { ascending: true }),
      supabase.from("broadcast_question_responses").select("option_id").eq("question_id", questionId)
    ]);

  if (questionError || optionsError || responsesError) {
    return { ok: false, message: "לא הצלחנו לטעון את השאלה. נסו שוב." };
  }
  if (!question) return { ok: false, message: "השאלה לא זמינה עבורך." };

  const questionFormat = asFormat(question.question_format);
  const selectionMode = asMode(question.selection_mode);
  const prompt = String(question.prompt ?? "").trim();
  if (!questionFormat || !selectionMode || !prompt) {
    return { ok: false, message: "לא הצלחנו לטעון את השאלה. נסו שוב." };
  }

  const parsedOptions = ((options ?? []) as Array<{ id?: unknown; label?: unknown; position?: unknown }>)
    .map((option) => ({
      id: String(option.id ?? "").trim(),
      label: String(option.label ?? "").trim(),
      position: Number(option.position)
    }))
    .filter((option) => option.id && option.label);

  return {
    ok: true,
    question: {
      id: questionId,
      prompt,
      questionFormat,
      selectionMode: questionFormat === "yes_no" ? "single" : selectionMode,
      closedAt: question.closed_at ? String(question.closed_at) : null,
      options: parsedOptions,
      selectedOptionIds: ((responses ?? []) as Array<{ option_id?: unknown }>)
        .map((row) => String(row.option_id ?? "").trim())
        .filter(Boolean)
    }
  };
}

async function acknowledgeQuestionNotification(
  supabase: SupabaseClient,
  userId: string,
  questionId: string
): Promise<void> {
  const { data, error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .select("id")
    .eq("user_id", userId)
    .eq("kind", "admin_broadcast")
    .filter("payload->>question_id", "eq", questionId);
  if (error || !data?.length) return;
  const ids = data.map((row) => String((row as { id?: unknown }).id ?? "").trim()).filter(Boolean);
  if (ids.length === 0) return;
  await markNotificationsRead(supabase, userId, { ids });
}

export async function submitBroadcastQuestionAnswer(
  supabase: SupabaseClient,
  questionId: string,
  optionIds: string[]
): Promise<{ ok: true; optionIds: string[]; replaced: boolean } | { ok: false; message: string }> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData.user;
  if (authError || !user) return { ok: false, message: "יש להתחבר כדי לענות." };

  const { data, error } = await supabase.rpc(SUBMIT_RPC, {
    p_question_id: questionId,
    p_option_ids: optionIds
  });
  if (error) return { ok: false, message: broadcastQuestionSubmitMessage(error) };

  const saved = savedOptionIds(data, questionId);
  if (!saved) return { ok: false, message: "לא הצלחנו לשמור את התשובה. נסו שוב." };

  const replaced = Boolean((data as { replaced?: unknown } | null)?.replaced);
  try {
    await acknowledgeQuestionNotification(supabase, user.id, questionId);
  } catch {
    // The response row is already saved and is what keeps the card from returning.
  }
  publishBroadcastQuestionAnswered(questionId);
  return { ok: true, optionIds: saved, replaced };
}
