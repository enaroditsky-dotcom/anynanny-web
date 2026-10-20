const QUESTION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const BROADCAST_QUESTION_ANSWERED_EVENT = "anynanny:broadcast-question-answered";
export const MY_QUESTIONS_HREF = "/broadcast/questions";

export function broadcastQuestionIdFromPayload(
  payload: { question_id?: unknown; [key: string]: unknown } | null | undefined
): string | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = "question_id" in payload ? payload.question_id : null;
  const id = String(raw ?? "").trim();
  return QUESTION_ID.test(id) ? id : null;
}

export function broadcastQuestionHref(questionId: string): string {
  return `/broadcast/question/${encodeURIComponent(questionId)}`;
}

export function isBroadcastQuestionPath(pathname: string | null | undefined, questionId: string): boolean {
  const path = String(pathname ?? "").split(/[?#]/, 1)[0] ?? "";
  return path === broadcastQuestionHref(questionId);
}

/** Closing the card hides it for now. It is not an answer, so read_at stays empty. */
export function broadcastQuestionDismissPersistsRead(
  payload: { question_id?: unknown; [key: string]: unknown } | null | undefined
): boolean {
  return !broadcastQuestionIdFromPayload(payload);
}

export function omitAnsweredBroadcastQuestions<
  T extends { payload: { question_id?: unknown; [key: string]: unknown } }
>(
  notifications: T[],
  answeredQuestionIds: ReadonlySet<string>
): T[] {
  if (answeredQuestionIds.size === 0) return notifications;
  return notifications.filter((row) => {
    const questionId = broadcastQuestionIdFromPayload(row.payload);
    return !questionId || !answeredQuestionIds.has(questionId);
  });
}

export function publishBroadcastQuestionAnswered(questionId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(BROADCAST_QUESTION_ANSWERED_EVENT, { detail: { questionId } })
  );
}
