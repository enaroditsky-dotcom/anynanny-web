import { isBroadcastQuestionPath } from "@/lib/broadcast/question-link";

/** One floating card. Further open questions stay in the badge and inbox. */
export const UNANSWERED_QUESTION_CARD_LIMIT = 1;

export type UnansweredQuestionCandidate = {
  id: string;
  prompt: string;
  createdAt: string;
  answered: boolean;
  closed: boolean;
};

export type UnansweredNoticeState = {
  count: number;
  questions: UnansweredQuestionCandidate[];
  loaded: boolean;
  dismissedIds: string[];
  /** Session-only. A successful answer stays hidden if a stale reload still lists it. */
  answeredIds: string[];
};

export const EMPTY_UNANSWERED_NOTICE: UnansweredNoticeState = {
  count: 0,
  questions: [],
  loaded: false,
  dismissedIds: [],
  answeredIds: []
};

export function isPendingBroadcastQuestion(row: { answered: boolean; closed: boolean }): boolean {
  return !row.answered && !row.closed;
}

export function formatUnansweredQuestionBadge(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  const whole = Math.floor(count);
  if (whole <= 0) return null;
  return whole > 99 ? "99+" : String(whole);
}

export function extraUnansweredQuestionLabel(extraCount: number): string | null {
  if (!Number.isFinite(extraCount) || extraCount <= 0) return null;
  const whole = Math.floor(extraCount);
  if (whole <= 0) return null;
  if (whole === 1) return "עוד שאלה אחת ממתינה";
  return `עוד ${whole} שאלות ממתינות`;
}

/** Shown after every individual question card has been closed. The count is unchanged. */
export function unansweredInboxFallbackLabel(count: number): string | null {
  const badge = formatUnansweredQuestionBadge(count);
  if (!badge) return null;
  if (badge === "1") return "שאלה אחת ממתינה";
  return `${badge} שאלות ממתינות`;
}

export function selectDashboardQuestionCards<T extends UnansweredQuestionCandidate>(
  rows: readonly T[],
  options?: { dismissedIds?: ReadonlySet<string>; limit?: number }
): T[] {
  const dismissed = options?.dismissedIds ?? new Set<string>();
  const limit = options?.limit ?? UNANSWERED_QUESTION_CARD_LIMIT;
  const seen = new Set<string>();
  return rows
    .filter((row) => {
      const id = row.id.trim();
      const prompt = row.prompt.trim();
      if (!id || !prompt || !isPendingBroadcastQuestion(row) || dismissed.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => {
      const byTime = b.createdAt.localeCompare(a.createdAt);
      return byTime === 0 ? b.id.localeCompare(a.id) : byTime;
    })
    .slice(0, Math.max(0, limit));
}

export function questionNoticeVisibleOnPath(pathname: string | null | undefined, questionId: string): boolean {
  const id = questionId.trim();
  if (!id) return false;
  return !isBroadcastQuestionPath(pathname, id);
}

export function reduceUnansweredNotice(
  state: UnansweredNoticeState,
  event:
    | { type: "loaded"; count: number; questions: UnansweredQuestionCandidate[] }
    | { type: "failed" }
    | { type: "dismiss"; questionId: string }
    | { type: "answered"; questionId: string }
    | { type: "reset" }
): UnansweredNoticeState {
  if (event.type === "reset") return EMPTY_UNANSWERED_NOTICE;
  if (event.type === "failed") return state.loaded ? state : EMPTY_UNANSWERED_NOTICE;
  if (event.type === "dismiss") {
    const questionId = event.questionId.trim();
    if (!questionId || state.dismissedIds.includes(questionId)) return state;
    return { ...state, dismissedIds: [...state.dismissedIds, questionId] };
  }
  if (event.type === "answered") {
    const questionId = event.questionId.trim();
    if (!questionId || state.answeredIds.includes(questionId)) return state;
    const hadLoaded = state.questions.some((row) => row.id === questionId);
    const counted = hadLoaded || state.count > state.questions.length;
    return {
      ...state,
      count: counted ? Math.max(0, state.count - 1) : state.count,
      questions: state.questions.filter((row) => row.id !== questionId),
      dismissedIds: state.dismissedIds.filter((id) => id !== questionId),
      answeredIds: [...state.answeredIds, questionId]
    };
  }
  const answered = new Set(state.answeredIds);
  const questions = event.questions.filter((row) => !answered.has(row.id));
  const staleAnswered = event.questions.length - questions.length;
  const count = Math.max(0, (Number.isFinite(event.count) ? Math.floor(event.count) : 0) - staleAnswered);
  return {
    count,
    questions,
    loaded: true,
    dismissedIds: state.dismissedIds,
    answeredIds: state.answeredIds
  };
}

export function noticeVisibleToUser<T extends { ownerId: string | null }>(
  view: T,
  userId: string | null
): T | null {
  return view.ownerId === userId ? view : null;
}

export function unansweredNoticeView(state: UnansweredNoticeState): {
  count: number;
  badge: string | null;
  card: { id: string; prompt: string } | null;
  extraLabel: string | null;
  inboxFallbackLabel: string | null;
  loaded: boolean;
  pendingIds: string[];
} {
  const hidden = new Set([...state.dismissedIds, ...state.answeredIds]);
  const [card] = selectDashboardQuestionCards(state.questions, { dismissedIds: hidden });
  const visibleCard = card ? { id: card.id, prompt: card.prompt.trim() } : null;
  const extraCount = Math.max(0, state.count - (visibleCard ? 1 : 0));
  const pendingIds: string[] = [];
  const seen = new Set<string>();
  for (const row of state.questions) {
    const id = row.id.trim();
    if (!id || !isPendingBroadcastQuestion(row) || seen.has(id)) continue;
    seen.add(id);
    pendingIds.push(id);
  }
  return {
    count: state.count,
    badge: formatUnansweredQuestionBadge(state.count),
    card: visibleCard,
    extraLabel: visibleCard ? extraUnansweredQuestionLabel(extraCount) : null,
    inboxFallbackLabel: visibleCard ? null : unansweredInboxFallbackLabel(state.count),
    loaded: state.loaded,
    pendingIds
  };
}
