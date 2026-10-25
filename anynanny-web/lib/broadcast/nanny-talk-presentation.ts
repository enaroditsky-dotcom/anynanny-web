/**
 * Which Nanny Talks modal is eligible right now.
 * Pending questions and unread regular broadcasts come from the same records
 * Messages lists. Session dismissal is caller state and does not persist.
 */
export const NANNY_TALK_REFRESH_MS = 15000;

export type NannyTalkModal =
  | { type: "question"; questionId: string }
  | { type: "broadcast"; broadcastId: string }
  | null;

export type NannyTalkModalInput = {
  operationalPending: boolean;
  pendingQuestionId: string | null;
  pendingQuestionVisible: boolean;
  dismissedQuestionIds: readonly string[];
  heldQuestionId: string | null;
  heldQuestionVisible: boolean;
  broadcastId: string | null;
  hiddenBroadcastIds: readonly string[];
};

export function talkItemModalQuestionId(
  item: { kind: string; id: string; pending: boolean } | null
): string | null {
  if (!item || item.kind !== "question" || !item.pending) return null;
  const id = item.id.trim();
  return id || null;
}

export function resolveNannyTalkModal(input: NannyTalkModalInput): NannyTalkModal {
  if (input.operationalPending) return null;

  const pendingQuestionId = input.pendingQuestionId?.trim() || null;
  if (
    pendingQuestionId &&
    input.pendingQuestionVisible &&
    !input.dismissedQuestionIds.includes(pendingQuestionId)
  ) {
    return { type: "question", questionId: pendingQuestionId };
  }

  const broadcastId = input.broadcastId?.trim() || null;
  if (broadcastId && !input.hiddenBroadcastIds.includes(broadcastId)) {
    return { type: "broadcast", broadcastId };
  }

  const heldQuestionId = input.heldQuestionId?.trim() || null;
  if (
    heldQuestionId &&
    input.heldQuestionVisible &&
    !input.dismissedQuestionIds.includes(heldQuestionId)
  ) {
    return { type: "question", questionId: heldQuestionId };
  }

  return null;
}
