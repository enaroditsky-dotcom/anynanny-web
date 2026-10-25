"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "@/components/auth-provider";
import { loadUnansweredBroadcastQuestionNotice } from "@/lib/broadcast/question-inbox";
import { BROADCAST_QUESTION_ANSWERED_EVENT } from "@/lib/broadcast/question-link";
import {
  EMPTY_UNANSWERED_NOTICE,
  noticeVisibleToUser,
  reduceUnansweredNotice,
  unansweredNoticeView,
  type UnansweredNoticeState
} from "@/lib/broadcast/question-visibility";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type NoticeView = ReturnType<typeof unansweredNoticeView> & { ownerId: string | null };

const EMPTY_VIEW: NoticeView = {
  ownerId: null,
  count: 0,
  badge: null,
  card: null,
  extraLabel: null,
  inboxFallbackLabel: null,
  loaded: false,
  pendingIds: []
};

let state: UnansweredNoticeState = EMPTY_UNANSWERED_NOTICE;
let boundUserId: string | null = null;
let boundClient: SupabaseClient | null = null;
let retainCount = 0;
let running = false;
let queued = false;
let removeWindowListeners: (() => void) | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function commit(next: UnansweredNoticeState): void {
  state = next;
  emit();
}

export function readUnansweredNoticeView(): NoticeView {
  return { ownerId: boundUserId, ...unansweredNoticeView(state) };
}

export function dismissUnansweredQuestionCard(questionId: string): void {
  commit(reduceUnansweredNotice(state, { type: "dismiss", questionId }));
}

async function loadBoundNotice(): Promise<void> {
  const userId = boundUserId;
  const supabase = boundClient;
  if (!userId || !supabase) {
    commit(reduceUnansweredNotice(state, { type: "reset" }));
    return;
  }
  try {
    const notice = await loadUnansweredBroadcastQuestionNotice(supabase, userId);
    if (boundUserId !== userId) return;
    commit(reduceUnansweredNotice(state, { type: "loaded", count: notice.count, questions: notice.questions }));
  } catch {
    if (boundUserId !== userId) return;
    commit(reduceUnansweredNotice(state, { type: "failed" }));
  }
}

export function refreshUnansweredBroadcastQuestions(): Promise<void> {
  if (running) {
    queued = true;
    return Promise.resolve();
  }
  running = true;
  queued = false;
  return loadBoundNotice()
    .finally(() => {
      running = false;
      if (!queued) return;
      queued = false;
      void refreshUnansweredBroadcastQuestions();
    });
}

function noteAnswered(questionId: string): void {
  commit(reduceUnansweredNotice(state, { type: "answered", questionId }));
  void refreshUnansweredBroadcastQuestions();
}

export function retainUnansweredQuestionLoader(
  supabase: SupabaseClient | null,
  userId: string | null
): () => void {
  retainCount += 1;
  const nextUserId = userId?.trim() || null;
  const userChanged = nextUserId !== boundUserId;
  boundUserId = nextUserId;
  boundClient = nextUserId ? supabase : null;
  if (userChanged) commit(reduceUnansweredNotice(state, { type: "reset" }));

  if (retainCount === 1 && typeof window !== "undefined") {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshUnansweredBroadcastQuestions();
    };
    const onAnswered = (event: Event) => {
      const questionId = String((event as CustomEvent<{ questionId?: string }>).detail?.questionId ?? "");
      noteAnswered(questionId);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    window.addEventListener(BROADCAST_QUESTION_ANSWERED_EVENT, onAnswered);
    removeWindowListeners = () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
      window.removeEventListener(BROADCAST_QUESTION_ANSWERED_EVENT, onAnswered);
    };
  }

  if (boundUserId && boundClient) void refreshUnansweredBroadcastQuestions();

  return () => {
    retainCount = Math.max(0, retainCount - 1);
    if (retainCount > 0) return;
    removeWindowListeners?.();
    removeWindowListeners = null;
  };
}

export function useUnansweredBroadcastQuestions(): NoticeView {
  const { signedIn, user } = useAuth();
  const userId = signedIn && user?.id ? user.id : null;
  const [view, setView] = useState<NoticeView>(readUnansweredNoticeView);

  useEffect(() => {
    const pull = () => setView(readUnansweredNoticeView());
    listeners.add(pull);
    pull();
    return () => {
      listeners.delete(pull);
    };
  }, []);

  useEffect(() => {
    return retainUnansweredQuestionLoader(userId ? getSupabaseBrowserClient() : null, userId);
  }, [userId]);

  if (noticeVisibleToUser(view, userId)) return view;
  return { ...EMPTY_VIEW, ownerId: userId };
}
