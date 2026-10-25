"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarX2,
  Clock3,
  Megaphone,
  MessageCircle,
  Wallet,
  X
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { BroadcastQuestionAnswer } from "@/components/broadcast/broadcast-question-answer";
import { NannyTalksFrame } from "@/components/broadcast/nanny-talks-frame";
import { userHasAnsweredBroadcastQuestion } from "@/lib/broadcast/question-answer";
import {
  BROADCAST_QUESTION_ANSWERED_EVENT,
  broadcastQuestionDismissPersistsRead,
  broadcastQuestionIdFromPayload
} from "@/lib/broadcast/question-link";
import {
  dismissUnansweredQuestionCard,
  refreshUnansweredBroadcastQuestions,
  useUnansweredBroadcastQuestions
} from "@/lib/broadcast/use-unanswered-questions";
import {
  BROADCAST_REMOVED_EVENT,
  BROADCAST_TALKS_HREF,
  EXPLICIT_BROADCAST_REMOVAL_LABEL,
  removeOwnRegularBroadcast
} from "@/lib/broadcast/system-talks";
import { isInternalBroadcastCtaRoute } from "@/lib/admin/broadcast-cta";
import {
  emptyBroadcastArrivalSound,
  observeBroadcastArrivals,
  type BroadcastArrivalSoundState
} from "@/lib/broadcast/broadcast-arrival-sound";
import { NANNY_TALK_REFRESH_MS, resolveNannyTalkModal } from "@/lib/broadcast/nanny-talk-presentation";
import { playBroadcastArrivalTone } from "@/lib/broadcast/play-broadcast-arrival-tone";
import { questionNoticeVisibleOnPath } from "@/lib/broadcast/question-visibility";
import { BookingScheduleText } from "@/components/bookings/booking-schedule-label";
import { NOTIFICATIONS_TABLE } from "@/lib/chat/constants";
import {
  applyOperationalEventPopupChange,
  collapsePaymentCompletionCards,
  coordinationBookingHref,
  coordinationChatHref,
  coordinationScheduleLabel,
  fetchUnreadAdminBroadcastNotifications,
  fetchUnreadPaymentCompletionNotifications,
  isAdminBroadcastNotificationKind,
  isCoordinationNotificationKind,
  isGlobalOperationalNotificationKind,
  operationalCardActionLabel,
  OPERATIONAL_EVENT_POPUP_DURATION_MS,
  shouldPersistOperationalCardRead,
  type CoordinationNotification
} from "@/lib/notifications/coordination";
import { isOperationalCardsSuppressedRoute } from "@/lib/notifications/operational-card-routes";
import { markNotificationsReadBestEffort } from "@/lib/notifications/read-state";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";

function keepsOperationalCardOnDashboard(kind: CoordinationNotification["kind"]): boolean {
  return isAdminBroadcastNotificationKind(kind) || kind === "manual_payment_confirmed";
}

function toneForKind(kind: CoordinationNotification["kind"]): "emerald" | "amber" | "rose" {
  if (isAdminBroadcastNotificationKind(kind)) return "amber";
  if (
    kind === "booking_approved" ||
    kind === "shift_confirmed" ||
    kind === "booking_cancellation_approved" ||
    kind === "payment_received" ||
    kind === "manual_payment_confirmed"
  ) {
    return "emerald";
  }
  if (
    kind === "booking_rejected" ||
    kind === "booking_cancellation_requested" ||
    kind === "pending_booking_expired" ||
    kind === "booking_withdrawn_by_parent" ||
    kind === "manual_payment_denied"
  ) {
    return "rose";
  }
  return "amber";
}

const TONE_CLASS = {
  emerald: "border-emerald-300 bg-emerald-50 text-emerald-950",
  amber: "border-amber-300 bg-amber-50 text-amber-950",
  rose: "border-rose-300 bg-rose-50 text-rose-950"
} as const;

function IconForKind({ kind }: { kind: CoordinationNotification["kind"] }) {
  const className = "mt-0.5 h-5 w-5 shrink-0";
  if (isAdminBroadcastNotificationKind(kind)) {
    return <Megaphone className={className} aria-hidden />;
  }
  if (kind === "booking_rejected" || kind === "booking_withdrawn_by_parent") {
    return <CalendarX2 className={className} aria-hidden />;
  }
  if (
    kind === "manual_payment_confirmed" ||
    kind === "manual_payment_denied" ||
    kind === "manual_payment_resolved_reported" ||
    kind === "payment_received"
  ) {
    return <Wallet className={className} aria-hidden />;
  }
  if (kind === "missed_shift_clarification") {
    return <AlertTriangle className={className} aria-hidden />;
  }
  if (kind === "shift_end_reminder") {
    return <Clock3 className={className} aria-hidden />;
  }
  return <CalendarCheck2 className={className} aria-hidden />;
}

const ICON_BUTTON =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-current/70 transition hover:bg-white/70 hover:text-current";

function rememberBroadcastArrival(
  stateRef: { current: BroadcastArrivalSoundState },
  input: {
    userId: string | null;
    channel: "question" | "broadcast";
    ids: readonly string[];
    ready: boolean;
  }
): void {
  const next = observeBroadcastArrivals(stateRef.current, {
    ...input,
    audible: typeof document !== "undefined" && document.visibilityState === "visible"
  });
  stateRef.current = next.state;
  if (next.play) playBroadcastArrivalTone();
}

export function GlobalCoordinationNotifications() {
  const { signedIn, user, isLoading, currentRole, effectiveRole } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const dismissTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const answeredQuestionIdsRef = useRef<Set<string>>(new Set());
  const pendingQuestionInserts = useRef<Map<string, { eventType?: string; new?: Record<string, unknown> | null }>>(
    new Map()
  );
  const [items, setItems] = useState<CoordinationNotification[]>([]);
  const [questionLookupError, setQuestionLookupError] = useState<string | null>(null);
  const [lookupRetry, setLookupRetry] = useState(0);
  const [inboxRefresh, setInboxRefresh] = useState(0);
  const [hiddenBroadcastIds, setHiddenBroadcastIds] = useState<string[]>([]);
  const [removingBroadcastId, setRemovingBroadcastId] = useState<string | null>(null);
  const [broadcastRemoveError, setBroadcastRemoveError] = useState<string | null>(null);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [dismissedQuestionIds, setDismissedQuestionIds] = useState<string[]>([]);
  const unansweredQuestions = useUnansweredBroadcastQuestions();

  const userId = signedIn && user?.id ? user.id : null;
  const arrivalSoundRef = useRef(emptyBroadcastArrivalSound());
  useEffect(() => {
    arrivalSoundRef.current = emptyBroadcastArrivalSound();
    setHiddenBroadcastIds([]);
    setRemovingBroadcastId(null);
    setBroadcastRemoveError(null);
    setActiveQuestionId(null);
    setDismissedQuestionIds([]);
  }, [userId]);
  const role: "parent" | "sitter" =
    effectiveRole === "sitter" || effectiveRole === "parent" ? effectiveRole : currentRole;

  const clearDismissTimer = useCallback((id: string) => {
    const timer = dismissTimersRef.current.get(id);
    if (timer) clearTimeout(timer);
    dismissTimersRef.current.delete(id);
  }, []);

  const dismissPopup = useCallback(
    (
      id: string,
      options?: {
        markRead?: boolean;
        kind?: CoordinationNotification["kind"];
        dedupeKey?: string | null;
      }
    ) => {
      clearDismissTimer(id);
      setItems((prev) => prev.filter((row) => row.id !== id));
      if (
        userId &&
        shouldPersistOperationalCardRead({
          markRead: options?.markRead,
          kind: options?.kind,
          dedupeKey: options?.dedupeKey
        })
      ) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          void markNotificationsReadBestEffort(supabase, userId, { ids: [id] });
        }
      }
    },
    [clearDismissTimer, userId]
  );

  const scheduleDismiss = useCallback(
    (id: string, kind?: string) => {
      if (isAdminBroadcastNotificationKind(kind)) return;
      if (dismissTimersRef.current.has(id)) return;
      const timer = setTimeout(() => {
        dismissTimersRef.current.delete(id);
        setItems((prev) => prev.filter((row) => row.id !== id));
      }, OPERATIONAL_EVENT_POPUP_DURATION_MS);
      dismissTimersRef.current.set(id, timer);
    },
    []
  );

  useEffect(() => {
    answeredQuestionIdsRef.current = new Set();
    pendingQuestionInserts.current.clear();
    setQuestionLookupError(null);
    setItems([]);
    for (const timer of dismissTimersRef.current.values()) clearTimeout(timer);
    dismissTimersRef.current.clear();
  }, [userId]);

  useEffect(() => {
    const onAnswered = (event: Event) => {
      const questionId = String((event as CustomEvent<{ questionId?: string }>).detail?.questionId ?? "").trim();
      if (!questionId) return;
      answeredQuestionIdsRef.current.add(questionId);
      setItems((prev) => prev.filter((row) => broadcastQuestionIdFromPayload(row.payload) !== questionId));
    };
    window.addEventListener(BROADCAST_QUESTION_ANSWERED_EVENT, onAnswered);
    return () => window.removeEventListener(BROADCAST_QUESTION_ANSWERED_EVENT, onAnswered);
  }, []);

  useEffect(() => {
    if (!isOperationalCardsSuppressedRoute(pathname)) return;
    setItems((prev) => prev.filter((row) => keepsOperationalCardOnDashboard(row.kind)));
    for (const [id, timer] of [...dismissTimersRef.current.entries()]) {
      clearTimeout(timer);
      dismissTimersRef.current.delete(id);
    }
  }, [pathname]);

  useEffect(() => {
    if (!userId || isLoading) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;
    const load = () => {
      void refreshUnansweredBroadcastQuestions();
      void Promise.all([
        fetchUnreadAdminBroadcastNotifications(supabase, userId),
        fetchUnreadPaymentCompletionNotifications(supabase, userId)
      ]).then((results) => {
        if (cancelled) return;
        const [broadcasts] = results;
        if (!broadcasts.error) {
          rememberBroadcastArrival(arrivalSoundRef, {
            userId,
            channel: "broadcast",
            ids: broadcasts.notifications.map((row) => row.id),
            ready: true
          });
          setQuestionLookupError((current) =>
            broadcasts.questionStatusError
              ? broadcasts.questionStatusError
              : pendingQuestionInserts.current.size > 0
                ? current
                : null
          );
        }
        setItems((prev) => {
          const [, payments] = results;
          const next = new Map<string, CoordinationNotification>();
          for (const row of prev) {
            if (isAdminBroadcastNotificationKind(row.kind)) continue;
            next.set(row.id, row);
          }
          const broadcastRows = broadcasts.error
            ? prev.filter((row) => isAdminBroadcastNotificationKind(row.kind))
            : broadcasts.notifications;
          for (const row of broadcastRows) {
            const questionId = broadcastQuestionIdFromPayload(row.payload);
            if (questionId && answeredQuestionIdsRef.current.has(questionId)) continue;
            next.set(row.id, row);
          }
          if (!payments.error) {
            for (const row of payments.notifications) next.set(row.id, row);
          }
          return collapsePaymentCompletionCards([...next.values()]);
        });
      });
    };
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [userId, isLoading, lookupRetry, pathname, inboxRefresh]);

  useEffect(() => {
    if (!userId || isLoading) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setInboxRefresh((current) => current + 1);
    }, NANNY_TALK_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [userId, isLoading]);

  useEffect(() => {
    if (!userId || isLoading || lookupRetry === 0) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const pending = [...pendingQuestionInserts.current.entries()];
    if (pending.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const [questionId] of pending) {
        const answered = await userHasAnsweredBroadcastQuestion(supabase, questionId);
        if (cancelled) return;
        if (answeredQuestionIdsRef.current.has(questionId)) {
          pendingQuestionInserts.current.delete(questionId);
          continue;
        }
        if (answered !== true && answered !== false) {
          setQuestionLookupError("לא הצלחנו לבדוק אם השאלה כבר נענתה.");
          return;
        }
        pendingQuestionInserts.current.delete(questionId);
        void refreshUnansweredBroadcastQuestions();
      }
      if (!cancelled && pendingQuestionInserts.current.size === 0) setQuestionLookupError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [lookupRetry, userId, isLoading]);

  useEffect(() => {
    if (!userId || isLoading) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = subscribePostgresChanges(
      supabase,
      `coordination-notifications-${userId}`,
      {
        event: "INSERT",
        table: NOTIFICATIONS_TABLE,
        filter: `user_id=eq.${userId}`,
        handler: (payload) => {
          const record = payload.new as { kind?: unknown; payload?: { question_id?: unknown } } | null;
          const kind = String(record?.kind ?? "");
          if (kind && !isGlobalOperationalNotificationKind(kind)) return;
          const questionId = broadcastQuestionIdFromPayload(record?.payload);
          if (isAdminBroadcastNotificationKind(kind)) {
            void refreshUnansweredBroadcastQuestions();
            setInboxRefresh((current) => current + 1);
          }
          if (questionId) return;
          setItems((prev) => {
            const next = applyOperationalEventPopupChange(prev, payload, pathnameRef.current);
            for (const row of next) {
              if (!prev.some((existing) => existing.id === row.id)) {
                scheduleDismiss(row.id, row.kind);
              }
            }
            return next;
          });
        }
      }
    );
    const recipientChannel = subscribePostgresChanges(
      supabase,
      `broadcast-question-recipients-${userId}`,
      {
        event: "INSERT",
        table: "broadcast_question_recipients",
        filter: `user_id=eq.${userId}`,
        handler: () => {
          void refreshUnansweredBroadcastQuestions();
        }
      }
    );

    return () => {
      removeRealtimeChannel(supabase, channel);
      removeRealtimeChannel(supabase, recipientChannel);
    };
  }, [userId, isLoading, scheduleDismiss]);

  const openHref = useCallback(
    async (item: CoordinationNotification, href: string) => {
      if (!userId) return;
      if (broadcastQuestionIdFromPayload(item.payload)) {
        router.push(href);
        return;
      }
      dismissPopup(item.id);
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        await markNotificationsReadBestEffort(supabase, userId, {
          ids: [item.id],
          kind: item.kind,
          bookingId: String(item.payload.booking_id ?? "").trim() || undefined
        });
      }
      router.push(href);
    },
    [userId, router, dismissPopup]
  );

  const routeItems = isOperationalCardsSuppressedRoute(pathname)
    ? items.filter((row) => keepsOperationalCardOnDashboard(row.kind))
    : items;
  const visibleItems = collapsePaymentCompletionCards(routeItems).filter(
    (row) => !broadcastQuestionIdFromPayload(row.payload)
  );
  const operationalItems = visibleItems.filter((row) => !isAdminBroadcastNotificationKind(row.kind));
  const regularBroadcast =
    visibleItems.find(
      (row) => isAdminBroadcastNotificationKind(row.kind) && !hiddenBroadcastIds.includes(row.id)
    ) ?? null;
  const hiddenOnItsPage = Boolean(
    unansweredQuestions.card && !questionNoticeVisibleOnPath(pathname, unansweredQuestions.card.id)
  );
  const questionCard = hiddenOnItsPage ? null : unansweredQuestions.card;
  const pendingQuestionId = questionCard?.id ?? null;
  const broadcastBlockedByOperations = operationalItems.length > 0;
  const nannyModal = resolveNannyTalkModal({
    operationalPending: broadcastBlockedByOperations,
    pendingQuestionId,
    pendingQuestionVisible: pendingQuestionId ? questionNoticeVisibleOnPath(pathname, pendingQuestionId) : false,
    dismissedQuestionIds,
    heldQuestionId: activeQuestionId,
    heldQuestionVisible: activeQuestionId ? questionNoticeVisibleOnPath(pathname, activeQuestionId) : false,
    broadcastId: regularBroadcast?.id ?? null,
    hiddenBroadcastIds
  });
  const questionTalkVisible = nannyModal?.type === "question";
  const showRegularTalk = nannyModal?.type === "broadcast";
  const displayQuestionId = nannyModal?.type === "question" ? nannyModal.questionId : null;

  useEffect(() => {
    if (!pendingQuestionId || dismissedQuestionIds.includes(pendingQuestionId)) return;
    setActiveQuestionId(pendingQuestionId);
  }, [pendingQuestionId, dismissedQuestionIds]);

  useEffect(() => {
    rememberBroadcastArrival(arrivalSoundRef, {
      userId,
      channel: "question",
      ids: unansweredQuestions.pendingIds,
      ready: Boolean(userId) && unansweredQuestions.loaded
    });
  }, [userId, unansweredQuestions.loaded, unansweredQuestions.pendingIds]);

  useEffect(() => {
    const onRemoved = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      setActiveQuestionId((current) => (current === id ? null : current));
    };
    window.addEventListener(BROADCAST_REMOVED_EVENT, onRemoved);
    return () => window.removeEventListener(BROADCAST_REMOVED_EVENT, onRemoved);
  }, []);

  const dismissRegularTalk = () => {
    if (!regularBroadcast) return;
    setHiddenBroadcastIds((current) => (current.includes(regularBroadcast.id) ? current : [...current, regularBroadcast.id]));
  };

  const removeRegularTalk = async () => {
    if (!regularBroadcast || !userId || removingBroadcastId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setRemovingBroadcastId(regularBroadcast.id);
    const result = await removeOwnRegularBroadcast(supabase, userId, regularBroadcast.id);
    setRemovingBroadcastId(null);
    if (!result.ok) {
      setBroadcastRemoveError(result.message);
      return;
    }
    setBroadcastRemoveError(null);
    dismissPopup(regularBroadcast.id);
  };

  if (!userId || (operationalItems.length === 0 && !questionLookupError && !questionTalkVisible && !showRegularTalk)) return null;

  return (
    <>
    <div
      className="pointer-events-none fixed inset-x-0 top-12 z-[60] px-2 pt-1.5 sm:px-3"
      style={{ top: "calc(3rem + env(safe-area-inset-top, 0px))" }}
      dir="rtl"
      aria-live="polite"
    >
      <div className="pointer-events-none mx-auto flex max-h-[min(38vh,18rem)] w-full max-w-sm flex-col gap-2 overflow-y-auto overscroll-y-contain sm:mx-0 sm:ms-4 sm:me-auto">
        {questionLookupError ? (
          <div className="pointer-events-auto rounded-2xl border border-amber-300 bg-amber-50 p-3 text-right text-sm text-[#001F3F]" role="alert">
            <p>{questionLookupError} השאלה לא סומנה כנענתה.</p>
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-xl border border-[#001F3F]/20 px-3 text-sm font-semibold"
                onClick={() => setLookupRetry((retry) => retry + 1)}
              >
                נסו שוב
              </button>
              <Link
                href={BROADCAST_TALKS_HREF}
                className="inline-flex min-h-11 items-center rounded-xl bg-[#001F3F] px-3 text-sm font-bold text-white"
              >
                הודעות המערכת
              </Link>
            </div>
          </div>
        ) : null}
        {operationalItems.map((item) => {
          const tone = toneForKind(item.kind);
          const schedule = coordinationScheduleLabel(item.payload);
          const bookingHref = coordinationBookingHref(item.kind, role, item.payload);
          const chatHref = isCoordinationNotificationKind(item.kind)
            ? coordinationChatHref(role, item.payload)
            : null;

          return (
            <article
              key={item.id}
              role="status"
              className={`pointer-events-auto rounded-2xl border p-3 text-right shadow-md ${TONE_CLASS[tone]}`}
            >
              <div className="flex flex-row-reverse items-start gap-1">
                <button
                  type="button"
                  aria-label="סגור"
                  className={ICON_BUTTON}
                  onClick={() =>
                    dismissPopup(item.id, {
                      markRead: broadcastQuestionDismissPersistsRead(item.payload),
                      kind: item.kind,
                      dedupeKey: item.dedupe_key
                    })
                  }
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
                <div className="flex min-w-0 flex-1 flex-row-reverse items-start gap-2">
                  <IconForKind kind={item.kind} />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-bold leading-snug">{item.title}</h2>
                    {schedule ? (
                      <p className="mt-1 text-[12px] font-medium tabular-nums text-current/80">
                        <BookingScheduleText label={schedule} />
                      </p>
                    ) : null}
                    {item.body && item.body !== item.title ? (
                      <p className="mt-1 break-words text-[12px] leading-snug text-current/75">{item.body}</p>
                    ) : null}
                    <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
                      {chatHref ? (
                        <button
                          type="button"
                          className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-current/20 bg-white/80 px-2.5 text-[12px] font-semibold"
                          onClick={() => void openHref(item, chatHref)}
                        >
                          <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                          פתח צ׳אט
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex min-h-11 items-center rounded-xl bg-[#001F3F] px-3 text-[12px] font-bold text-white"
                        onClick={() => void openHref(item, bookingHref)}
                      >
                        {operationalCardActionLabel(item.kind, item.payload)}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
    {questionTalkVisible && displayQuestionId ? (
      <NannyTalksFrame
        title="AnyNanny"
        onDismiss={() => {
          dismissUnansweredQuestionCard(displayQuestionId);
          setDismissedQuestionIds((current) =>
            current.includes(displayQuestionId) ? current : [...current, displayQuestionId]
          );
          setActiveQuestionId((current) => (current === displayQuestionId ? null : current));
        }}
      >
        <BroadcastQuestionAnswer questionId={displayQuestionId} embedded />
      </NannyTalksFrame>
    ) : null}
    {showRegularTalk && regularBroadcast ? (
      <NannyTalksFrame title="AnyNanny" onDismiss={dismissRegularTalk}>
        {regularBroadcast.title ? <p className="text-base font-semibold leading-snug">{regularBroadcast.title}</p> : null}
        {regularBroadcast.body && regularBroadcast.body !== regularBroadcast.title ? (
          <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed">{regularBroadcast.body}</p>
        ) : null}
        {isInternalBroadcastCtaRoute(String(regularBroadcast.payload.cta_route ?? "")) ? (
          <Link
            href={String(regularBroadcast.payload.cta_route)}
            className="mt-3 inline-flex min-h-11 items-center text-sm font-bold underline"
          >
            לפתיחה
          </Link>
        ) : null}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-md border border-neutral-300 bg-neutral-100 px-4 text-sm font-semibold"
            disabled={removingBroadcastId === regularBroadcast.id}
            onClick={() => void removeRegularTalk()}
          >
            {EXPLICIT_BROADCAST_REMOVAL_LABEL}
          </button>
        </div>
        {broadcastRemoveError ? (
          <p className="mt-2 text-sm text-rose-700" role="alert">
            {broadcastRemoveError}
          </p>
        ) : null}
      </NannyTalksFrame>
    ) : null}
    </>
  );
}
