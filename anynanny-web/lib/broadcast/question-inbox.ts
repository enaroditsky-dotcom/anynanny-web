import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isUnsatisfiableRangeError,
  pageBounds,
  respondentPageFromQuery
} from "@/lib/admin/broadcast-question-results";
import { MY_QUESTIONS_HREF } from "@/lib/broadcast/question-link";

export const MY_QUESTIONS_PAGE_SIZE = 20;
export { MY_QUESTIONS_HREF };

export type MyQuestionStatus = "pending" | "answered" | "closed";

export type MyBroadcastQuestion = {
  id: string;
  prompt: string;
  createdAt: string;
  closedAt: string | null;
  answered: boolean;
  closed: boolean;
};

export function parseMyQuestionStatus(value: unknown): MyQuestionStatus {
  if (value === "answered" || value === "closed") return value;
  return "pending";
}

export function matchesMyQuestionFilter(
  row: { answered: boolean; closed: boolean },
  status: MyQuestionStatus
): boolean {
  if (status === "pending") return !row.answered && !row.closed;
  if (status === "answered") return row.answered;
  return row.closed;
}

type EmbeddedQuestion = {
  id?: unknown;
  prompt?: unknown;
  created_at?: unknown;
  closed_at?: unknown;
};

type RecipientListRow = {
  question_id?: unknown;
  created_at?: unknown;
  first_responded_at?: unknown;
  broadcast_questions?: EmbeddedQuestion | EmbeddedQuestion[] | null;
};

function embeddedQuestion(value: RecipientListRow["broadcast_questions"]): EmbeddedQuestion | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type StatusQuery = {
  is(column: string, value: null): StatusQuery;
  not(column: string, operator: string, value: null): StatusQuery;
};

function applyMyQuestionStatus<T extends StatusQuery>(query: T, status: MyQuestionStatus): T {
  if (status === "pending") {
    return query.is("first_responded_at", null).is("broadcast_questions.closed_at", null) as T;
  }
  if (status === "answered") {
    return query.not("first_responded_at", "is", null) as T;
  }
  return query.not("broadcast_questions.closed_at", "is", null) as T;
}

async function countMyBroadcastQuestions(
  supabase: SupabaseClient,
  userId: string,
  status: MyQuestionStatus
): Promise<number> {
  const filtered = applyMyQuestionStatus(
    supabase
      .from("broadcast_question_recipients")
      .select("question_id, broadcast_questions!inner(id)", { count: "exact", head: true })
      .eq("user_id", userId),
    status
  );
  const { count, error } = await filtered;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function listMyBroadcastQuestions(
  supabase: SupabaseClient,
  input: { userId: string; status: MyQuestionStatus; page: number }
): Promise<{ questions: MyBroadcastQuestion[]; page: number; pageSize: number; total: number }> {
  const userId = input.userId.trim();
  const bounds = pageBounds(input.page, MY_QUESTIONS_PAGE_SIZE);
  if (!userId) return { questions: [], page: bounds.page, pageSize: MY_QUESTIONS_PAGE_SIZE, total: 0 };

  const filtered = applyMyQuestionStatus(
    supabase
      .from("broadcast_question_recipients")
      .select(
        "question_id, created_at, first_responded_at, broadcast_questions!inner(id, prompt, created_at, closed_at)",
        { count: "exact" }
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(bounds.from, bounds.to),
    input.status
  );

  const { data, error, count } = await filtered;
  const page = respondentPageFromQuery({
    data: (data ?? null) as RecipientListRow[] | null,
    count,
    error,
    totalWhenUnsatisfiable:
      error && isUnsatisfiableRangeError(error)
        ? await countMyBroadcastQuestions(supabase, userId, input.status)
        : 0
  });
  if (page.error) throw new Error(page.error);

  const questions = page.rows.flatMap((row) => {
    const question = embeddedQuestion(row.broadcast_questions);
    const id = String(question?.id ?? row.question_id ?? "").trim();
    const prompt = String(question?.prompt ?? "").trim();
    if (!id || !prompt) return [];
    const answered = row.first_responded_at != null;
    const closed = question?.closed_at != null;
    return [
      {
        id,
        prompt,
        createdAt: String(question?.created_at ?? row.created_at ?? ""),
        closedAt: closed ? String(question?.closed_at) : null,
        answered,
        closed
      }
    ];
  });

  return { questions, page: bounds.page, pageSize: MY_QUESTIONS_PAGE_SIZE, total: page.total };
}

/** Open questions addressed to this user that still have no submitted answer. */
export async function loadUnansweredBroadcastQuestionNotice(
  supabase: SupabaseClient,
  userId: string
): Promise<{ count: number; questions: MyBroadcastQuestion[] }> {
  const uid = userId.trim();
  if (!uid) return { count: 0, questions: [] };
  const page = await listMyBroadcastQuestions(supabase, { userId: uid, status: "pending", page: 1 });
  return { count: page.total, questions: page.questions };
}
