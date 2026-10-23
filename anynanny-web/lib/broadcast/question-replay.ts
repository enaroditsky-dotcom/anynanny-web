import { broadcastQuestionIdFromPayload } from "@/lib/broadcast/question-link";

/** Ordinary admin broadcasts keep this many replay cards. Questions do not use these slots. */
export const ORDINARY_BROADCAST_CARD_LIMIT = 5;

type PayloadRow = { payload: { question_id?: unknown; [key: string]: unknown } };

export function ordinaryAdminBroadcastsForReplay<T extends PayloadRow>(notifications: readonly T[]): T[] {
  return notifications
    .filter((row) => !broadcastQuestionIdFromPayload(row.payload))
    .slice(0, ORDINARY_BROADCAST_CARD_LIMIT);
}

export type QuestionStatusLookup =
  | { ok: true; answeredIds: ReadonlySet<string> }
  | { ok: false; error: string };

/**
 * A failed lookup is unknown, not answered. Answered ids are omitted.
 * Unknown rows must not be shown as new notifications.
 */
export function classifyQuestionNotifications<T extends PayloadRow>(
  notifications: readonly T[],
  lookup: QuestionStatusLookup
): { unanswered: T[]; answered: T[]; unknown: T[] } {
  const questions = notifications.filter((row) => Boolean(broadcastQuestionIdFromPayload(row.payload)));
  if (!lookup.ok) return { unanswered: [], answered: [], unknown: questions };

  const unanswered: T[] = [];
  const answered: T[] = [];
  for (const row of questions) {
    const questionId = broadcastQuestionIdFromPayload(row.payload);
    if (!questionId) continue;
    if (lookup.answeredIds.has(questionId)) answered.push(row);
    else unanswered.push(row);
  }
  return { unanswered, answered, unknown: [] };
}
