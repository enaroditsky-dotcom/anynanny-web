import type { SupabaseClient } from "@supabase/supabase-js";
import { broadcastQuestionHref, broadcastQuestionHomeHref } from "@/lib/broadcast/question-link";
import { fetchUnreadAdminBroadcastNotifications } from "@/lib/notifications/coordination";
import { isInternalBroadcastCtaRoute } from "@/lib/admin/broadcast-cta";
import { markNotificationsRead } from "@/lib/notifications/read-state";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";

export const NANNY_IMAGE_SRC = "/brand/BROADCAST%20NANNY.png";
export const EXPLICIT_BROADCAST_REMOVAL_LABEL = "סגור ומחק את ההודעה";
export const ANYNANNY_SYSTEM_CONVERSATION_TITLE = "AnyNanny — הודעות מערכת";
export const BROADCAST_TALKS_HREF = "/broadcast/talks";
export const BROADCAST_REMOVED_EVENT = "anynanny:broadcast-removed";

export type SystemTalkItem = {
  id: string;
  kind: "question" | "broadcast";
  title: string;
  createdAt: string;
  href: string;
  pending: boolean;
};

export function broadcastPendingBadge(questionCount: number, regularCount: number): string | null {
  const total = Math.max(0, questionCount) + Math.max(0, regularCount);
  if (total <= 0) return null;
  return total > 9 ? "9+" : String(total);
}

export function systemConversationVisible(itemCount: number): boolean {
  return itemCount > 0;
}

export function publishBroadcastRemoved(id: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BROADCAST_REMOVED_EVENT, { detail: { id } }));
}

type QuestionRow = {
  question_id?: unknown;
  created_at?: unknown;
  first_responded_at?: unknown;
  broadcast_questions?:
    | { prompt?: unknown; created_at?: unknown; closed_at?: unknown }
    | { prompt?: unknown; created_at?: unknown; closed_at?: unknown }[]
    | null;
};

function questionEmbed(value: QuestionRow["broadcast_questions"]) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function loadSystemTalkItems(
  supabase: SupabaseClient,
  userId: string,
  _role: "parent" | "sitter"
): Promise<{ items: SystemTalkItem[]; error: string | null }> {
  const uid = userId.trim();
  if (!uid) return { items: [], error: null };

  let questionQuery = await supabase
    .from("broadcast_question_recipients")
    .select("question_id, created_at, first_responded_at, broadcast_questions!inner(prompt, created_at, closed_at)")
    .eq("user_id", uid)
    .is("removed_at", null);

  if (questionQuery.error && isPostgrestMissingColumnError(questionQuery.error.message, "removed_at")) {
    questionQuery = await supabase
      .from("broadcast_question_recipients")
      .select("question_id, created_at, first_responded_at, broadcast_questions!inner(prompt, created_at, closed_at)")
      .eq("user_id", uid);
  }
  if (questionQuery.error) {
    return { items: [], error: "לא הצלחנו לטעון את הודעות המערכת." };
  }

  const questions: SystemTalkItem[] = ((questionQuery.data ?? []) as QuestionRow[]).flatMap((row) => {
    const question = questionEmbed(row.broadcast_questions);
    const id = String(row.question_id ?? "").trim();
    if (!id || !question) return [];
    const prompt = String(question.prompt ?? "").trim();
    const answered = row.first_responded_at != null && String(row.first_responded_at) !== "";
    const closed = question.closed_at != null && String(question.closed_at) !== "";
    return [{
      id,
      kind: "question" as const,
      title: prompt || "שאלה",
      createdAt: String(row.created_at ?? question.created_at ?? ""),
      href: broadcastQuestionHref(id),
      pending: !answered && !closed
    }];
  });

  const regular = await fetchUnreadAdminBroadcastNotifications(supabase, uid);
  if (regular.error) return { items: questions, error: "לא הצלחנו לטעון את כל הודעות המערכת." };
  const broadcasts: SystemTalkItem[] = regular.notifications.map((row) => ({
    id: row.id,
    kind: "broadcast" as const,
    title: row.body && row.body !== row.title ? `${row.title} — ${row.body}` : row.title,
    createdAt: row.created_at,
    href: (() => {
      const route = String(row.payload.cta_route ?? "").trim();
      return isInternalBroadcastCtaRoute(route) ? route : "";
    })(),
    pending: true
  }));

  const items = [...questions, ...broadcasts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { items, error: null };
}

export async function removeOwnBroadcastQuestion(
  supabase: SupabaseClient,
  questionId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.rpc("remove_own_broadcast_question", { p_question_id: questionId });
  if (error) {
    if (isPostgrestMissingColumnError(error.message, "removed_at") || /remove_own_broadcast_question/i.test(error.message)) {
      return { ok: false, message: "הסרת ההודעה עדיין לא זמינה. התשובה נשמרה." };
    }
    return { ok: false, message: "לא הצלחנו להסיר את ההודעה. נסו שוב." };
  }
  publishBroadcastRemoved(questionId);
  return { ok: true };
}

export async function removeOwnRegularBroadcast(
  supabase: SupabaseClient,
  userId: string,
  notificationId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const result = await markNotificationsRead(supabase, userId, { ids: [notificationId] });
  if (result.error) return { ok: false, message: "לא הצלחנו להסיר את ההודעה. נסו שוב." };
  publishBroadcastRemoved(notificationId);
  return { ok: true };
}

export function talksHomeHref(role: string | null | undefined): "/parent/dashboard" | "/sitter/dashboard" {
  return broadcastQuestionHomeHref(role);
}
