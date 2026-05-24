"use client";

import Link from "next/link";
import { Calendar, History, Search, Settings, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SessionFinalSummary } from "@/components/session/session-final-summary";
import { SessionRatingModal } from "@/components/session/session-rating-modal";
import { ActionToast } from "@/components/ui/action-toast";
import { useAuth } from "@/components/auth-provider";
import { DashboardWelcomeHeader } from "@/components/dashboard/dashboard-welcome-header";
import {
  DoubleShakeCircleButton,
  DoubleShakeCircleSlot,
  DoubleShakeShiftPanel
} from "@/components/session/double-shake-circle-button";
import { ParentDoubleShakeIdleCircle } from "@/components/session/parent-double-shake-idle-circle";
import { parentApproveSitterStart } from "@/lib/bookings/parent-approve-sitter-start";
import { doesBookingBlockSessionShiftUi } from "@/lib/bookings/booking-shift-ui";
import { bookingLiveSyncKey } from "@/lib/bookings/booking-live-key";
import { BOOKINGS_TABLE, type BookingRow, type BookingStatus } from "@/lib/bookings/constants";
import { useTodaysLinkedBooking, type TodaysLinkedBookingSyncPayload } from "@/lib/bookings/use-todays-linked-booking";
import type { TodaysLinkedBookingView } from "@/lib/bookings/todays-linked-booking";
import { useCircleBookingSync } from "@/lib/bookings/use-circle-booking-sync";
import { normalizeBookingStatus } from "@/lib/bookings/use-shift-activation-status";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import {
  HOURLY_RATE,
  SESSIONS_TABLE,
  SESSION_STATUS_CANCELLED,
  SESSION_STATUS_PENDING_SITTER_APPROVAL,
  computeLiveElapsedSecondsActive,
  type SessionProtocolState,
  type SupabaseSessionRow,
  formatElapsed,
  mapSupabaseRowToProtocol,
  persistSessionState,
  readSessionState
} from "@/lib/session/protocol";
import { friendlySupabaseSessionError, isSupabaseBadRequestError } from "@/lib/session/supabase-errors";
import { completedSummaryFromEndedState } from "@/lib/session/completed-summary";
import { postStripeCheckoutSession } from "@/lib/stripe/post-checkout-session";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";
import { useDashboardGreetingName } from "@/lib/user/use-dashboard-greeting-name";
import {
  dismissCompletedSession,
  parentSessionStateFromSupabaseRow,
  readDismissedCompletedSessionId
} from "@/lib/session/dismissed-completed";
import {
  isShiftLocallyDismissed,
  persistShiftLocallyDismissed
} from "@/lib/session/dismissed-shift-lock";

const BOOKING_SHIFT_REJECTED_NOTICE = "הבייביסיטר דחתה את הזימון למשמרת";

export default function ParentDashboardPage() {
  const router = useRouter();
  const { isLoading: authLoading } = useAuth();

  /** getSession() can succeed when middleware getUser() misses — show grid as soon as we see a browser session. */
  const [clientHasSessionUser, setClientHasSessionUser] = useState<boolean | null>(null);

  const [sessionState, setSessionState] = useState<SessionProtocolState>({ status: "idle" });
  const [nowMs, setNowMs] = useState(Date.now());
  const [useSupabase, setUseSupabase] = useState(false);
  const [parentUserId, setParentUserId] = useState<string | null>(null);
  const [dbBanner, setDbBanner] = useState<string | null>(null);
  /** Debug: confirms Supabase write reached DB (start insert or end-request update). */
  const [debugToast, setDebugToast] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  /** Session id for rating after summary — kept out of `sessionState` so the dashboard can return to idle under the modal. */
  const [ratingTargetSessionId, setRatingTargetSessionId] = useState<string | null>(null);
  const [bookingPaymentStatus, setBookingPaymentStatus] = useState<"unknown" | "paid" | "unpaid">("unknown");
  const [payBusy, setPayBusy] = useState(false);
  const [stripeCheckoutNonce, setStripeCheckoutNonce] = useState(0);
  const [bookingFeedbackToast, setBookingFeedbackToast] = useState<string | null>(null);
  const [bookingFeedbackVariant, setBookingFeedbackVariant] = useState<"success" | "error" | "info">("info");
  /** Persistent inline notice when today's shift request was rejected/cancelled. */
  const [bookingShiftRejectedNotice, setBookingShiftRejectedNotice] = useState(false);
  const [startShiftBusy, setStartShiftBusy] = useState(false);
  /** Client-side hard lock — survives failed session/RPC sync after shift end. */
  const [shiftUiLocked, setShiftUiLocked] = useState(false);

  const lockShiftUi = useCallback((bookingId?: string) => {
    if (bookingId?.trim()) {
      persistShiftLocallyDismissed(bookingId);
    }
    setShiftUiLocked(true);
  }, []);
  const prevShiftGateStatusRef = useRef<string | null>(null);
  const shiftCompletedFrozenRef = useRef(false);
  const sessionFetchBlockedRef = useRef(false);

  const { circleBooking, syncFromPayload, syncFromLinkedBooking, applyCircleBooking } =
    useCircleBookingSync("parent");

  const breakCompletedRealtimeLoop = useCallback(
    (source: "sync" | "realtime") => {
      if (shiftCompletedFrozenRef.current) return;
      shiftCompletedFrozenRef.current = true;
      console.log(`=== SHIFT COMPLETED: BREAKING REALTIME LOOP (${source}) ===`);
      applyCircleBooking(null);
    },
    [applyCircleBooking]
  );

  const applyBookingShiftNotice = useCallback((status: BookingStatus | null | undefined) => {
    if (status === "rejected" || status === "cancelled") {
      setBookingShiftRejectedNotice(true);
    } else if (status === "pending" || status === "approved") {
      setBookingShiftRejectedNotice(false);
    }
  }, []);

  const handleBookingLiveSync = useCallback(
    (payload: TodaysLinkedBookingSyncPayload) => {
      const incomingStatus = normalizeBookingStatus(
        payload.row?.status ?? payload.booking?.status
      );

      if (incomingStatus === "completed" || todaysBookingStatusRef.current === "completed") {
        breakCompletedRealtimeLoop("sync");
        return;
      }

      if (shiftCompletedFrozenRef.current) {
        return;
      }

      syncFromPayload(payload);
      if (payload.booking) {
        syncFromLinkedBooking(payload.booking);
      }

      const row = payload.row;
      if (!payload.liveFieldsChanged || !row?.status) return;

      const rowStatus = normalizeBookingStatus(row.status) ?? "";
      if (rowStatus === "rejected" || rowStatus === "cancelled") {
        applyBookingShiftNotice(rowStatus);
        setBookingFeedbackVariant("error");
        setBookingFeedbackToast(BOOKING_SHIFT_REJECTED_NOTICE);
      } else if (rowStatus === "approved" && payload.source === "realtime") {
        applyBookingShiftNotice("approved");
        setBookingFeedbackVariant("success");
        setBookingFeedbackToast("הבייביסיטר אישרה את בקשת המשמרת!");
      }
    },
    [
      breakCompletedRealtimeLoop,
      syncFromPayload,
      syncFromLinkedBooking,
      applyBookingShiftNotice
    ]
  );

  const {
    booking: todaysBooking,
    shiftGate: todayBookingShiftGate,
    ready: bookingGuardReady,
    reload: reloadTodaysBooking
  } = useTodaysLinkedBooking("parent", parentUserId, {
    onBookingSync: handleBookingLiveSync
  });

  const todaysBookingId = todaysBooking?.id ?? "";
  const todaysBookingStatus = normalizeBookingStatus(todaysBooking?.status) ?? "";
  const todaysBookingUpdatedAt = todaysBooking?.updated_at ?? "";
  const todaysBookingStartTime = todaysBooking?.start_time ?? "";
  const todaysBookingEndTime = todaysBooking?.end_time ?? "";
  const bookingSyncKey = [
    todaysBookingId,
    todaysBookingStatus,
    todaysBookingUpdatedAt,
    todaysBookingStartTime,
    todaysBookingEndTime
  ].join("|");

  const circleBookingId = circleBooking?.id ?? "";
  const circleBookingStatus = normalizeBookingStatus(circleBooking?.status) ?? "";
  const circleBookingUpdatedAt = circleBooking?.updated_at ?? "";
  const shiftGateStatus = normalizeBookingStatus(todayBookingShiftGate?.status) ?? "";

  const sessionStatus = sessionState.status;
  const sessionLinkedBookingId = sessionState.linkedBookingId ?? "";
  const sessionSupabaseSessionId = sessionState.supabaseSessionId ?? "";

  const todaysBookingRef = useRef(todaysBooking);
  todaysBookingRef.current = todaysBooking;
  const todaysBookingStatusRef = useRef(todaysBookingStatus);
  todaysBookingStatusRef.current = todaysBookingStatus;

  useEffect(() => {
    setShiftUiLocked(isShiftLocallyDismissed(todaysBookingId));
  }, [todaysBookingId]);

  useEffect(() => {
    if (todaysBookingStatus === "completed") {
      lockShiftUi(todaysBookingId);
      breakCompletedRealtimeLoop("sync");
      return;
    }
    if (bookingGuardReady && todaysBookingId && !isShiftLocallyDismissed(todaysBookingId)) {
      setShiftUiLocked(false);
    }
  }, [todaysBookingStatus, todaysBookingId, bookingGuardReady, breakCompletedRealtimeLoop, lockShiftUi]);

  const { fullName, nameLoading: greetingNameLoading } = useDashboardGreetingName(
    "parent",
    parentUserId
  );

  const syncFromStorage = useCallback(() => {
    try {
      setSessionState(readSessionState());
    } catch {
      setSessionState({ status: "idle" });
    }
  }, []);

  const parentCircleLiveKey = useMemo(
    () => bookingLiveSyncKey(circleBooking ?? todaysBooking),
    [
      circleBookingId,
      circleBookingStatus,
      circleBookingUpdatedAt,
      todaysBookingId,
      todaysBookingStatus,
      todaysBookingUpdatedAt
    ]
  );

  const idleCircleBooking = circleBooking ?? todaysBooking;

  const sessionUiBlockedByBooking = useMemo(
    () =>
      bookingGuardReady &&
      doesBookingBlockSessionShiftUi(
        shiftGateStatus ? { status: shiftGateStatus as BookingStatus } : null
      ),
    [bookingGuardReady, shiftGateStatus]
  );

  const elapsedSeconds = useMemo(() => {
    if (sessionStatus === "parent_initiated") return 0;
    const startedAt = sessionState.parentStartedAtMs;
    if (!startedAt) return 0;
    if (sessionStatus === "active") {
      return computeLiveElapsedSecondsActive({
        startMs: startedAt,
        parentEndRequestedAtMs: sessionState.parentEndRequestedAtMs ?? null,
        nowMs
      });
    }
    return sessionState.finalElapsedSeconds ?? 0;
  }, [nowMs, sessionStatus, sessionState.parentStartedAtMs, sessionState.parentEndRequestedAtMs, sessionState.finalElapsedSeconds]);

  const timerText = useMemo(() => formatElapsed(elapsedSeconds), [elapsedSeconds]);
  const earnedNis = useMemo(() => ((elapsedSeconds / 3600) * HOURLY_RATE).toFixed(2), [elapsedSeconds]);

  const completedSummary = useMemo(
    () => completedSummaryFromEndedState(sessionState, HOURLY_RATE),
    [
      sessionStatus,
      sessionState.endedAtMs,
      sessionState.finalElapsedSeconds,
      sessionState.finalAmountNis,
      sessionState.parentStartedAtMs
    ]
  );

  const handlePayForShift = useCallback(async () => {
    const bid = sessionLinkedBookingId.trim();
    if (!bid) {
      setDbBanner("לא נמצאה משמרת מקושרת לתשלום. נסו לרענן את הדף.");
      return;
    }
    const amountNis = completedSummary?.amountNis ?? sessionState.finalAmountNis ?? 0;
    const amountMinorUnits = Math.max(50, Math.round(Number(amountNis) * 100));
    setPayBusy(true);
    setDbBanner(null);
    try {
      const result = await postStripeCheckoutSession({
        bookingId: bid,
        amountMinorUnits,
        currency: "ils",
        description: "תשלום משמרת AnyNanny"
      });
      if (!result.ok) {
        setDbBanner(result.error);
        return;
      }
      window.location.assign(result.url);
    } catch (e) {
      console.error("[parent] Stripe checkout:", e);
      setDbBanner("שגיאה בפתיחת התשלום. נסו שוב.");
    } finally {
      setPayBusy(false);
    }
  }, [sessionLinkedBookingId, sessionState.finalAmountNis, completedSummary]);

  const handleSummaryCloseRequestRating = useCallback(() => {
    const bookingId = sessionLinkedBookingId || todaysBookingId;
    if (bookingId) {
      persistShiftLocallyDismissed(bookingId);
    }
    lockShiftUi(bookingId);
    const sid = sessionSupabaseSessionId;
    if (!sid) {
      persistSessionState({ status: "idle" });
      setSessionState({ status: "idle" });
      setNowMs(Date.now());
      return;
    }
    setRatingTargetSessionId(sid);
    persistSessionState({ status: "idle" });
    setSessionState({ status: "idle" });
    setNowMs(Date.now());
    setRatingOpen(true);
  }, [sessionSupabaseSessionId, sessionLinkedBookingId, todaysBookingId, lockShiftUi]);

  const handleRatingResolved = useCallback(() => {
    const bookingId = sessionLinkedBookingId || todaysBookingId;
    if (bookingId) {
      persistShiftLocallyDismissed(bookingId);
    }
    lockShiftUi(bookingId);
    const sid = ratingTargetSessionId;
    if (sid) {
      dismissCompletedSession(sid, "parent");
    }
    setRatingTargetSessionId(null);
    persistSessionState({ status: "idle" });
    setSessionState({ status: "idle" });
    setRatingOpen(false);
    setDbBanner(null);
    setNowMs(Date.now());
    router.push("/parent/dashboard");
    router.refresh();
  }, [router, ratingTargetSessionId, sessionLinkedBookingId, todaysBookingId, lockShiftUi]);

  useEffect(() => {
    if (sessionFetchBlockedRef.current || shiftUiLocked || isShiftLocallyDismissed(todaysBookingId)) {
      return;
    }
    if (shiftCompletedFrozenRef.current || todaysBookingStatus === "completed") {
      breakCompletedRealtimeLoop("sync");
      lockShiftUi(todaysBookingId);
      return;
    }
    if (!todaysBookingId) return;
    syncFromLinkedBooking(todaysBookingRef.current);
  }, [bookingSyncKey, syncFromLinkedBooking, breakCompletedRealtimeLoop, todaysBookingStatus, todaysBookingId, shiftUiLocked, lockShiftUi]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get("checkout");
    if (c === "success") {
      setDbBanner("התשלום הושלם בהצלחה.");
      setStripeCheckoutNonce((n) => n + 1);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (c === "cancel") {
      setDbBanner("התשלום בוטל. ניתן לנסות שוב בכל עת.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!debugToast) return;
    const t = window.setTimeout(() => setDebugToast(null), 3800);
    return () => window.clearTimeout(t);
  }, [debugToast]);

  /** Toast when sitter approves/rejects today's booking (via shiftGate realtime refetch). */
  useEffect(() => {
    const next = shiftGateStatus || null;
    const prev = prevShiftGateStatusRef.current;
    prevShiftGateStatusRef.current = next;

    if (!next || !prev || prev === next) return;

    if (prev === "pending" && next === "approved") {
      setBookingFeedbackVariant("success");
      setBookingFeedbackToast("הבייביסיטר אישרה את בקשת המשמרת!");
      return;
    }

    if (prev === "pending" && (next === "rejected" || next === "cancelled")) {
      applyBookingShiftNotice(next);
      setBookingFeedbackVariant("error");
      setBookingFeedbackToast(BOOKING_SHIFT_REJECTED_NOTICE);
    }
  }, [shiftGateStatus, applyBookingShiftNotice]);

  /** Sync inline notice from latest today booking row (survives linked-booking refetch). */
  useEffect(() => {
    applyBookingShiftNotice(shiftGateStatus || undefined);
  }, [shiftGateStatus, applyBookingShiftNotice]);

  /** Parent-scoped bookings realtime — toast/notice only; booking state lives in useTodaysLinkedBooking. */
  useEffect(() => {
    if (shiftCompletedFrozenRef.current || todaysBookingStatus === "completed") {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase || !parentUserId) return;

    const handleRowChange = (payload: RealtimePostgresChangesPayload<BookingRow>) => {
      if (payload.eventType !== "UPDATE" && payload.eventType !== "INSERT") return;

      const row = (payload.new ?? null) as BookingRow | null;
      if (!row?.status) return;

      const incomingStatus =
        typeof row.status === "object" && row.status !== null
          ? (row.status as { name?: string }).name
          : row.status;

      if (
        incomingStatus === "completed" ||
        todaysBookingStatusRef.current === "completed" ||
        shiftCompletedFrozenRef.current
      ) {
        breakCompletedRealtimeLoop("realtime");
        return;
      }

      const rowStatus = normalizeBookingStatus(row.status) ?? "";
      const prevStatus = prevShiftGateStatusRef.current;
      if (prevStatus === rowStatus) return;

      if (rowStatus === "rejected" || rowStatus === "cancelled") {
        applyBookingShiftNotice(rowStatus);
        setBookingFeedbackVariant("error");
        setBookingFeedbackToast(BOOKING_SHIFT_REJECTED_NOTICE);
      } else if (rowStatus === "approved" && prevStatus === "pending") {
        applyBookingShiftNotice("approved");
        setBookingFeedbackVariant("success");
        setBookingFeedbackToast("הבייביסיטר אישרה את בקשת המשמרת!");
      }
    };

    const channel = supabase
      .channel(`parent-dashboard-bookings-${parentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: BOOKINGS_TABLE,
          filter: `parent_id=eq.${parentUserId}`
        },
        handleRowChange
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: BOOKINGS_TABLE,
          filter: `parent_id=eq.${parentUserId}`
        },
        handleRowChange
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [parentUserId, todaysBookingStatus, applyBookingShiftNotice, breakCompletedRealtimeLoop]);

  useEffect(() => {
    if (sessionStatus !== "ended") {
      setBookingPaymentStatus("unknown");
      return;
    }
    // Payment columns are not on `bookings` until the stripe migration runs.
    setBookingPaymentStatus("unpaid");
  }, [sessionStatus, sessionLinkedBookingId, stripeCheckoutNonce]);

  /** No booking today → clear stale session placeholder (keep in-flight / active shift). */
  useEffect(() => {
    if (!bookingGuardReady || todaysBookingId) return;
    if (
      sessionStatus === "idle" ||
      sessionStatus === "parent_initiated" ||
      sessionStatus === "active"
    ) {
      return;
    }
    const idle: SessionProtocolState = { status: "idle" };
    persistSessionState(idle);
    setSessionState(idle);
    setNowMs(Date.now());
  }, [bookingGuardReady, todaysBookingId, sessionStatus]);

  /** Booking completed/cancelled early — hide live session timer even if still inside calendar slot. */
  useEffect(() => {
    if (!sessionUiBlockedByBooking) return;
    if (sessionStatus === "idle" || sessionStatus === "ended") return;
    const idle: SessionProtocolState = { status: "idle" };
    persistSessionState(idle);
    setSessionState(idle);
    setNowMs(Date.now());
  }, [sessionUiBlockedByBooking, sessionStatus]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setClientHasSessionUser(false);
      return;
    }
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setClientHasSessionUser(!!data.session?.user);
      } catch (e) {
        console.warn("[parent] auth getSession failed:", e);
      }
    })();
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const ticker = setInterval(() => setNowMs(Date.now()), 1000);
    const onStorage = (event: StorageEvent) => {
      if (event.key === "anynanny_payer_session_v1") syncFromStorage();
    };
    window.addEventListener("storage", onStorage);

    let cancelled = false;
    if (supabase) {
      void (async () => {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const fromSession = sessionData.session?.user ?? null;
          const { data: authData, error: authErr } = await supabase.auth.getUser();
          const resolvedUser = authData.user ?? fromSession;
          if (authErr && !resolvedUser) return;
          if (!resolvedUser) return;
          const userId = resolvedUser.id;
          if (cancelled) return;
          setParentUserId(userId);
          try {
            localStorage.setItem("active_role", "parent");
          } catch {
            /* ignore */
          }

          setUseSupabase(true);
        } catch (e) {
          console.warn("[parent] auth bootstrap failed:", e);
        }
      })();
    }

    return () => {
      cancelled = true;
      clearInterval(ticker);
      window.removeEventListener("storage", onStorage);
    };
  }, [syncFromStorage]);

  useEffect(() => {
    if (sessionFetchBlockedRef.current || shiftUiLocked || isShiftLocallyDismissed(todaysBookingId)) {
      return;
    }
    if (!parentUserId || !bookingGuardReady) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;

    void (async () => {
      try {
        let local: SessionProtocolState = { status: "idle" };
        try {
          local = readSessionState();
        } catch {
          /* ignore */
        }

        if (todaysBookingStatus === "completed" || shiftCompletedFrozenRef.current) {
          const idle: SessionProtocolState = { status: "idle" };
          persistSessionState(idle);
          if (!cancelled) setSessionState(idle);
          lockShiftUi(todaysBookingId);
          return;
        }

        if (!todaysBookingId) {
          if (local.status === "active" && local.parentStartedAtMs) {
            if (!cancelled) setSessionState(local);
            return;
          }
          const idle: SessionProtocolState = { status: "idle" };
          persistSessionState(idle);
          if (!cancelled) setSessionState(idle);
          return;
        }

        if (local.status === "active" && local.parentStartedAtMs) {
          if (!cancelled) setSessionState(local);
        }

        const { data: row, error: rowErr } = await supabase
          .from(SESSIONS_TABLE)
          .select("*")
          .eq("parent_id", parentUserId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (rowErr) {
          if (isSupabaseBadRequestError(rowErr)) {
            sessionFetchBlockedRef.current = true;
            console.warn("[parent] initial sessions fetch 400 - skipping state update");
            return;
          }
          console.warn("[parent] initial sessions fetch:", rowErr.message);
          return;
        }

        if (row) {
          const dismissedId = readDismissedCompletedSessionId("parent");
          const mapped = parentSessionStateFromSupabaseRow(row as SupabaseSessionRow, dismissedId);
          if (mapped) {
            if (local.status === "active" && mapped.status !== "active") {
              const preserved: SessionProtocolState = {
                ...local,
                supabaseSessionId: mapped.supabaseSessionId ?? local.supabaseSessionId,
                linkedBookingId: local.linkedBookingId ?? mapped.linkedBookingId ?? todaysBookingId
              };
              persistSessionState(preserved);
              if (!cancelled) setSessionState(preserved);
              return;
            }
            const merged: SessionProtocolState = {
              ...mapped,
              linkedBookingId: mapped.linkedBookingId ?? todaysBookingId
            };
            persistSessionState(merged);
            if (!cancelled) setSessionState(merged);
          }
        }
      } catch (e) {
        if (isSupabaseBadRequestError(e)) {
          sessionFetchBlockedRef.current = true;
          console.warn("[parent] session hydrate 400 - skipping state update");
          return;
        }
        console.warn("[parent] session hydrate error:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [parentUserId, bookingGuardReady, todaysBookingId, todaysBookingStatus, todaysBookingUpdatedAt, shiftUiLocked, lockShiftUi]);

  /** Prefer row id when known so parent_end_requested_at updates arrive instantly for that session. */
  useEffect(() => {
    if (
      sessionFetchBlockedRef.current ||
      shiftUiLocked ||
      isShiftLocallyDismissed(todaysBookingId) ||
      shiftCompletedFrozenRef.current ||
      todaysBookingStatus === "completed"
    ) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase || !parentUserId) return;

    const sid = sessionSupabaseSessionId;
    const filter = sid ? `id=eq.${sid}` : `parent_id=eq.${parentUserId}`;
    const channel = supabase.channel(`parent-session-rt-${parentUserId}-${sid ?? "none"}`);
    const handler = (payload: {
      new?: Record<string, unknown>;
      old?: Record<string, unknown>;
    }) => {
      try {
        const rowData = (payload.new ?? payload.old) as SupabaseSessionRow | undefined;
        if (!rowData || typeof rowData !== "object") return;
        const dismissedId = readDismissedCompletedSessionId("parent");
        const mapped = parentSessionStateFromSupabaseRow(rowData as SupabaseSessionRow, dismissedId);
        if (mapped) {
          setSessionState((prev) => {
            if (mapped.status === "idle") {
              persistSessionState(mapped);
              return mapped;
            }
            const merged: SessionProtocolState = {
              ...mapped,
              linkedBookingId: mapped.linkedBookingId ?? prev.linkedBookingId
            };
            persistSessionState(merged);
            return merged;
          });
        }
      } catch (e) {
        if (isSupabaseBadRequestError(e)) {
          sessionFetchBlockedRef.current = true;
          console.warn("[parent] session realtime 400 - skipping state update");
          return;
        }
        console.warn("[parent] session realtime handler error:", e);
      }
    };
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: SESSIONS_TABLE, filter },
      handler
    );
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [parentUserId, sessionSupabaseSessionId, todaysBookingStatus, todaysBookingId, shiftUiLocked]);

  const startSession = async () => {
    if (startShiftBusy) return;
    if (sessionState.status === "parent_initiated" || sessionState.status === "active") return;

    const bookingForShift = circleBooking ?? todaysBooking;
    if (!bookingForShift) {
      setDbBanner("אין משמרת מאושרת להיום עם בייביסיטר מקושר — לא ניתן לפתוח משמרת.");
      return;
    }

    const bookingStatus = normalizeBookingStatus(bookingForShift.status);
    if (!bookingStatus) {
      setDbBanner("לא ניתן לקרוא את סטטוס המשמרת.");
      return;
    }

    if (bookingStatus === "pending") {
      setDbBanner("ממתינים לאישור הבייביסיטר לפני תחילת המשמרת.");
      return;
    }

    if (bookingStatus === "rejected" || bookingStatus === "cancelled") {
      setDbBanner("לא ניתן לפתוח משמרת — הבקשה בוטלה או נדחתה.");
      return;
    }

    const auth = await resolveBrowserAuth();
    if (!auth.ok) {
      setDbBanner(auth.reason === "no_client" ? "Supabase לא מוגדר." : "יש להתחבר כדי לפתוח משמרת.");
      return;
    }

    const linkedSitterId = bookingForShift.sitter_id;
    if (!linkedSitterId) {
      setDbBanner("לא נמצא בייביסיטר מקושר למשמרת של היום.");
      return;
    }

    const preservedBooking: TodaysLinkedBookingView = {
      ...bookingForShift,
      status: bookingStatus
    };
    applyCircleBooking(preservedBooking);

    const startedAtMs = Date.now();
    const optimisticActive: SessionProtocolState = {
      status: "active",
      parentStartedAtMs: startedAtMs,
      linkedBookingId: preservedBooking.id,
      startConfirmed: true
    };
    persistSessionState(optimisticActive);
    setSessionState(optimisticActive);
    setNowMs(startedAtMs);
    setParentUserId(auth.userId);
    setStartShiftBusy(true);
    setDbBanner(null);
    setUseSupabase(true);

    try {
      if (bookingStatus === "sitter_started" || bookingStatus === "approved") {
        const { row } = await parentApproveSitterStart(
          auth.supabase,
          auth.userId,
          preservedBooking.id
        );
        if (row) {
          applyCircleBooking({
            ...preservedBooking,
            ...row,
            status: normalizeBookingStatus(row.status) ?? bookingStatus,
            schedule_label: preservedBooking.schedule_label,
            partner_user_id: preservedBooking.partner_user_id,
            partner_full_name: preservedBooking.partner_full_name,
            partner_sitter_code: preservedBooking.partner_sitter_code
          });
        }
      }

      const startIso = new Date(startedAtMs).toISOString();
      const sessionInserts: Record<string, unknown>[] = [
        {
          parent_id: auth.userId,
          sitter_id: linkedSitterId,
          status: "active",
          start_time: startIso,
          start_confirmed: true,
          booking_id: preservedBooking.id
        },
        {
          parent_id: auth.userId,
          sitter_id: linkedSitterId,
          status: "active",
          start_time: startIso
        },
        {
          parent_id: auth.userId,
          sitter_id: linkedSitterId,
          status: SESSION_STATUS_PENDING_SITTER_APPROVAL,
          start_time: null,
          booking_id: preservedBooking.id
        },
        {
          parent_id: auth.userId,
          sitter_id: linkedSitterId,
          status: SESSION_STATUS_PENDING_SITTER_APPROVAL,
          start_time: null
        }
      ];

      let row: Record<string, unknown> | null = null;
      let lastError: { message: string } | null = null;

      for (const insertBase of sessionInserts) {
        const ins = await auth.supabase.from(SESSIONS_TABLE).insert(insertBase).select("*").single();
        if (!ins.error && ins.data) {
          row = ins.data as Record<string, unknown>;
          break;
        }
        if (ins.error) {
          lastError = ins.error;
        }
      }

      if (row) {
        const mapped = mapSupabaseRowToProtocol(row as SupabaseSessionRow);
        const next: SessionProtocolState = mapped
          ? {
              ...optimisticActive,
              ...mapped,
              status: "active",
              parentStartedAtMs: mapped.parentStartedAtMs ?? startedAtMs,
              linkedBookingId: mapped.linkedBookingId ?? preservedBooking.id,
              startConfirmed: true
            }
          : optimisticActive;
        persistSessionState(next);
        setSessionState(next);
        setNowMs(Date.now());
        setDebugToast("המשמרת התחילה");
      } else {
        console.warn("[parent] session insert failed — keeping local active timer:", lastError?.message);
        persistSessionState(optimisticActive);
        setSessionState(optimisticActive);
        if (lastError) {
          setDbBanner("המשמרת פעילה מקומית — סנכרון לשרת יושלם ברקע.");
        }
      }
    } catch (e) {
      console.error("[parent] startSession:", e);
      persistSessionState(optimisticActive);
      setSessionState(optimisticActive);
      applyCircleBooking(preservedBooking);
      setDbBanner("המשמרת פעילה מקומית — נסו לרענן אם הטיימר לא מסתנכרן.");
    } finally {
      setStartShiftBusy(false);
    }
  };

  const cancelSession = async () => {
    if (sessionState.status !== "parent_initiated" || !sessionState.supabaseSessionId) return;

    const auth = await resolveBrowserAuth();
    if (!auth.ok) {
      setDbBanner(auth.reason === "no_client" ? "Supabase לא מוגדר." : "יש להתחבר כדי לבטל את הבקשה.");
      return;
    }

    setCancelBusy(true);
    setDbBanner(null);
    try {
      const { error } = await auth.supabase
        .from(SESSIONS_TABLE)
        .update({ status: SESSION_STATUS_CANCELLED })
        .eq("id", sessionState.supabaseSessionId)
        .eq("parent_id", auth.userId);

      if (error) {
        console.error("[parent] cancel session failed:", error.message);
        setDbBanner(friendlySupabaseSessionError(error));
        return;
      }

      const idle: SessionProtocolState = { status: "idle" };
      persistSessionState(idle);
      setSessionState(idle);
      setNowMs(Date.now());
    } catch (e) {
      console.error("[parent] cancelSession:", e);
      setDbBanner(friendlySupabaseSessionError(e));
    } finally {
      setCancelBusy(false);
    }
  };

  const endSession = async () => {
    if (sessionState.status === "parent_initiated") {
      setDbBanner("ממתין לאישור הבייביסיטר להתחלת המשמרת.");
      return;
    }
    if (sessionState.status !== "active" || !sessionState.parentStartedAtMs) return;
    if (sessionState.parentEndRequestedAtMs != null) {
      setDbBanner("כבר נשלחה בקשת סיום — ממתינים לאישור הבייביסיטר.");
      return;
    }
    if (useSupabase && sessionState.supabaseSessionId) {
      const auth = await resolveBrowserAuth();
      if (!auth.ok) {
        setDbBanner(auth.reason === "no_client" ? "Supabase לא מוגדר." : "יש להתחבר כדי לשלוח בקשת סיום.");
        return;
      }
      const reqAt = new Date().toISOString();
      try {
        const { data: row, error } = await auth.supabase
          .from(SESSIONS_TABLE)
          .update({ parent_end_requested_at: reqAt })
          .eq("id", sessionState.supabaseSessionId)
          .select("*")
          .single();
        if (!error && row) {
          const mapped = mapSupabaseRowToProtocol(row as SupabaseSessionRow);
          if (mapped) {
            persistSessionState(mapped);
            setSessionState(mapped);
            setDbBanner(null);
            setDebugToast("Request sent to Sitter");
            return;
          }
        }
        if (error) {
          console.error("[parent] request end failed:", error.message);
          setDbBanner(friendlySupabaseSessionError(error));
        }
      } catch (e) {
        console.error("[parent] endSession:", e);
        setDbBanner(friendlySupabaseSessionError(e));
      }
    }
  };

  const showParentIdleCircle =
    sessionState.status !== "ended" &&
    (sessionState.status !== "active" && sessionState.status !== "parent_initiated");

  const sessionRunning =
    !sessionUiBlockedByBooking &&
    (sessionState.status === "active" || sessionState.status === "parent_initiated");

  const waitingNannyStart = sessionState.status === "parent_initiated";
  const waitingNannyEnd =
    sessionState.status === "active" && sessionState.parentEndRequestedAtMs != null;

  const showLoading =
    clientHasSessionUser !== true && (clientHasSessionUser === null || (clientHasSessionUser === false && authLoading));

  if (showLoading) {
    return (
      <main
        className="mx-auto flex min-h-[40vh] w-full max-w-md items-center justify-center bg-[#FDFBF6] py-10"
        dir="rtl"
      >
        <p className="text-right text-sm text-slate-600">{"טוען..."}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-md flex-col space-y-5 bg-[#FDFBF6] py-2" dir="rtl">
      <DashboardWelcomeHeader fullName={fullName} nameLoading={greetingNameLoading} />

      {dbBanner ? (
        <div
          role="status"
          className="flex flex-row-reverse items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-right text-sm text-amber-950"
        >
          <button
            type="button"
            className="shrink-0 font-semibold text-amber-900 underline decoration-amber-700/60"
            onClick={() => setDbBanner(null)}
          >
            סגור
          </button>
          <p className="min-w-0 flex-1 leading-snug">{dbBanner}</p>
        </div>
      ) : null}

      <section className="rounded-3xl bg-white p-4 shadow-soft sm:p-5">
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/parent/calendar"
            className="group flex min-h-[7.25rem] flex-col items-end justify-between gap-2 rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 p-3 text-right text-navy-header shadow-sm transition hover:border-navy-header/25 hover:shadow-md active:scale-[0.98]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-navy-header/10">
              <Calendar className="h-7 w-7 stroke-[1.75]" aria-hidden />
            </span>
            <span className="w-full text-right text-xs font-semibold leading-snug sm:text-sm">יומן מפגשים</span>
          </Link>

          <Link
            href="/parent/wallet"
            className="group flex min-h-[7.25rem] flex-col items-end justify-between gap-2 rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 p-3 text-right text-navy-header shadow-sm transition hover:border-navy-header/25 hover:shadow-md active:scale-[0.98]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-navy-header/10">
              <Wallet className="h-7 w-7 stroke-[1.75]" aria-hidden />
            </span>
            <span className="w-full text-right text-xs font-semibold leading-snug sm:text-sm">ארנק ותשלומים</span>
          </Link>

          <Link
            href="/parent/settings"
            className="group flex min-h-[7.25rem] flex-col items-end justify-between gap-2 rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 p-3 text-right text-navy-header shadow-sm transition hover:border-navy-header/25 hover:shadow-md active:scale-[0.98]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-navy-header/10">
              <Settings className="h-7 w-7 stroke-[1.75]" aria-hidden />
            </span>
            <span className="w-full text-right text-xs font-semibold leading-snug sm:text-sm">הגדרות חשבון</span>
          </Link>

          <Link
            href="/parent/history"
            className="group flex min-h-[7.25rem] flex-col items-end justify-between gap-2 rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 p-3 text-right text-navy-header shadow-sm transition hover:border-navy-header/25 hover:shadow-md active:scale-[0.98]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-navy-header/10">
              <History className="h-7 w-7 stroke-[1.75]" aria-hidden />
            </span>
            <span className="w-full text-right text-xs font-semibold leading-snug sm:text-sm">היסטוריית שמרטפות</span>
          </Link>
        </div>

        <Link
          href="/parent/search"
          className="mt-3 flex min-h-[3.5rem] flex-row-reverse items-center justify-between gap-3 rounded-2xl border border-emerald-700/20 bg-emerald-50/80 px-4 py-3 text-right text-navy-header shadow-sm transition hover:border-emerald-700/35 hover:shadow-md active:scale-[0.99]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-emerald-800/15">
            <Search className="h-5 w-5 text-emerald-800" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 text-sm font-bold leading-snug text-emerald-950">חיפוש נני — דירוגים וביקורות</span>
        </Link>
      </section>

      <DoubleShakeShiftPanel>
        {sessionRunning ? (
          <div className="w-full space-y-2 text-right">
            <p className="text-xs font-medium text-slate-600">
              {waitingNannyStart
                ? "ממתין לאישור הבייביסיטר…"
                : waitingNannyEnd
                  ? "ממתין לאישור סיום..."
                  : "משמרת פעילה"}
            </p>
            {(sessionState.status === "active" || waitingNannyEnd) && (
              <>
                <p className="text-4xl font-bold tabular-nums tracking-wide text-[#001F3F]">{timerText}</p>
                <p className="text-sm font-semibold text-navy-800">סכום שנצבר: ₪{earnedNis}</p>
              </>
            )}
            {waitingNannyStart ? (
              <>
                <p className="text-4xl font-bold tabular-nums tracking-wide text-slate-400">00:00:00</p>
                <p className="text-sm font-semibold text-slate-500">סכום שנצבר: ₪0.00</p>
              </>
            ) : null}
          </div>
        ) : null}

        {bookingShiftRejectedNotice ? (
          <div
            className="mb-1 w-full rounded-2xl border-2 border-rose-400 bg-rose-50 px-4 py-3.5 text-right shadow-sm"
            role="alert"
            aria-live="assertive"
          >
            <p className="text-base font-bold leading-snug text-rose-950">{BOOKING_SHIFT_REJECTED_NOTICE}</p>
          </div>
        ) : null}

        <DoubleShakeCircleSlot>
          {sessionState.status === "ended" && completedSummary ? (
            <SessionFinalSummary
              elapsedSeconds={completedSummary.elapsedSeconds}
              amountNis={completedSummary.amountNis}
              onDismiss={handleSummaryCloseRequestRating}
              payAvailable={
                bookingPaymentStatus === "unpaid" && Boolean(sessionState.linkedBookingId?.trim())
              }
              payBusy={payBusy}
              onPay={() => void handlePayForShift()}
              paymentStatusLabel={
                bookingPaymentStatus === "paid"
                  ? "שולם"
                  : bookingPaymentStatus === "unknown" && sessionState.linkedBookingId
                    ? "בודקים סטטוס תשלום…"
                    : null
              }
            />
          ) : showParentIdleCircle ? (
            <ParentDoubleShakeIdleCircle
              key={parentCircleLiveKey}
              booking={idleCircleBooking}
              ready={bookingGuardReady}
              busy={startShiftBusy}
              sessionActive={sessionState.status === "active"}
              onStartShift={() => void startSession()}
            />
          ) : waitingNannyStart ? (
            <>
              <DoubleShakeCircleButton
                label="ממתין לאישור…"
                variant="waiting-navy"
                presentational
              />
              <button
                type="button"
                disabled={cancelBusy}
                onClick={() => void cancelSession()}
                className="rounded-xl border border-rose-300/90 bg-rose-50/50 px-4 py-2.5 text-sm font-semibold text-rose-800 shadow-sm transition hover:border-rose-400 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cancelBusy ? "מבטלים…" : "ביטול הבקשה"}
              </button>
            </>
          ) : sessionState.status === "active" && !waitingNannyEnd ? (
            <DoubleShakeCircleButton label="סיום משמרת" variant="salmon" onClick={() => void endSession()} />
          ) : waitingNannyEnd ? (
            <DoubleShakeCircleButton
              label="ממתין לאישור סיום..."
              variant="waiting-salmon"
              presentational
            />
          ) : null}
        </DoubleShakeCircleSlot>
      </DoubleShakeShiftPanel>

      {debugToast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 left-1/2 z-[100] max-w-[min(90vw,20rem)] -translate-x-1/2 rounded-2xl bg-emerald-800 px-5 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-emerald-900/25"
        >
          {debugToast}
        </div>
      ) : null}

      <ActionToast
        message={bookingFeedbackToast}
        variant={bookingFeedbackVariant}
        onDismiss={() => setBookingFeedbackToast(null)}
      />

      <SessionRatingModal
        open={ratingOpen}
        role="parent"
        sessionId={ratingTargetSessionId}
        onResolved={handleRatingResolved}
      />
    </main>
  );
}
