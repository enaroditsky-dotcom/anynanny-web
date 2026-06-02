"use client";

import Link from "next/link";
import { Calendar, History, Search, Settings, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ParentSessionClosurePanel } from "@/components/session/parent-session-closure-panel";
import { StuckShiftDevResetButton } from "@/components/sitter/stuck-shift-dev-reset";
import { ActionToast } from "@/components/ui/action-toast";
import { useAuth } from "@/components/auth-provider";
import { DashboardWelcomeHeader } from "@/components/dashboard/dashboard-welcome-header";
import {
  DoubleShakeCircleButton,
  DoubleShakeCircleSlot,
  DoubleShakeShiftPanel
} from "@/components/session/double-shake-circle-button";
import { ParentDoubleShakeIdleCircle, ParentSessionTimerCircle } from "@/components/session/parent-double-shake-idle-circle";
import { parentApproveSitterStart } from "@/lib/bookings/parent-approve-sitter-start";
import { bookingRowToCircleView } from "@/lib/bookings/circle-booking-state";
import {
  isParentBookingApprovalStatus,
  isParentBookingRejection,
  isParentBookingTrackingStatus,
  readBookingRowFromRealtimeChange
} from "@/lib/bookings/booking-realtime-handler";
import { doesBookingBlockSessionShiftUi, isBookingTerminalStatus, isNowWithinShiftActivationWindow } from "@/lib/bookings/booking-shift-ui";
import { isBookingDateToday, isNowWithinBookingWindow, resolveBookingWindowMs } from "@/lib/bookings/booking-date-utils";
import { fetchBookingPaymentStatus } from "@/lib/bookings/fetch-booking-payment-status";
import { bookingLiveSyncKey } from "@/lib/bookings/booking-live-key";
import { BOOKINGS_TABLE, type BookingRow, type BookingStatus } from "@/lib/bookings/constants";
import { useTodaysLinkedBooking, type TodaysLinkedBookingSyncPayload } from "@/lib/bookings/use-todays-linked-booking";
import type { TodaysLinkedBookingView } from "@/lib/bookings/todays-linked-booking";
import { fetchLinkedBookingById } from "@/lib/bookings/todays-linked-booking";
import { useCircleBookingSync } from "@/lib/bookings/use-circle-booking-sync";
import { normalizeBookingStatus } from "@/lib/bookings/use-shift-activation-status";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import {
  HOURLY_RATE,
  SESSIONS_TABLE,
  SESSION_STATUS_CANCELLED,
  SESSION_PENDING_START_STATUSES,
  computeLiveElapsedSecondsActive,
  type SessionProtocolState,
  type SupabaseSessionRow,
  formatElapsed,
  mapSupabaseRowToProtocol,
  persistSessionState,
  readSessionState
} from "@/lib/session/protocol";
import {
  activateParentConfirmedSession,
  insertSessionReturningRow,
  LIVE_BOOKING_STATUSES_FOR_SESSION_UI,
  readSessionLinkedBookingId,
  updateSessionReturningRow
} from "@/lib/session/sessions-query";
import { friendlySupabaseSessionError } from "@/lib/session/supabase-errors";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";
import { safeSupabaseRead } from "@/lib/supabase/safe-supabase-read";
import { completedSummaryFromEndedState } from "@/lib/session/completed-summary";
import { postStripeCheckoutSession } from "@/lib/stripe/post-checkout-session";
import { submitSessionRating } from "@/lib/ratings/submit-session-rating";
import type { PublicSitterReview } from "@/lib/sitter/sitter-profile";
import { useDashboardGreetingName } from "@/lib/user/use-dashboard-greeting-name";
import {
  dismissCompletedSession,
  readDismissedCompletedSessionId
} from "@/lib/session/dismissed-completed";
import {
  isShiftLocallyDismissed,
  persistShiftLocallyDismissed
} from "@/lib/session/dismissed-shift-lock";
import {
  canShowParentSessionClosure,
  fetchRelevantParentSessionRow,
  isClosureBookingStatus,
  mergeParentSessionFromDbRow,
  reconcileStaleEndedLocalState,
  resolveParentClosureBookingId
} from "@/lib/session/parent-session-sync";

const BOOKING_SHIFT_REJECTED_NOTICE = "הבקשה נדחתה על ידי המטפלת";
const BOOKING_SHIFT_PENDING_NOTICE = "בקשה נשלחה וממתינה לאישור";
const BOOKING_SHIFT_APPROVED_NOTICE = "הבקשה אושרה";
const BOOKING_SHIFT_APPROVED_TOAST = "הבייביסיטר אישרה את בקשת המשמרת!";

type ClosureBookingVerifyState = "idle" | "checking" | "ready" | "unavailable";

type ParentSessionView = "idle" | "shift" | "review_pay";

type ParentDashboardCenterView =
  | "loading"
  | "matching"
  | "in_progress"
  | "review_pay"
  | "shift"
  | "idle";

const LIVE_SESSION_DB_STATUSES = new Set([
  "matching",
  "in_progress",
  "active",
  "pending_sitter_approval",
  "pending",
  "pending_confirmation"
]);

const PARENT_REVIEW_SESSION_DB_STATUSES = new Set(["completed", "completed_pending_review"]);

function isLiveSessionDbStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return LIVE_SESSION_DB_STATUSES.has(status.toLowerCase());
}

function isParentReviewPaySessionAllowed(params: {
  bookingGuardReady: boolean;
  sessionHydrateError: boolean;
  bookingStatus: BookingStatus | null | undefined;
  sessionDbStatus: string | null;
  sessionProtocolStatus: SessionProtocolState["status"];
  sessionPaymentStatus?: string | null;
}): boolean {
  if (!params.bookingGuardReady || params.sessionHydrateError) return false;

  if (
    params.sessionProtocolStatus === "active" ||
    params.sessionProtocolStatus === "parent_initiated"
  ) {
    return false;
  }

  if (
    params.bookingStatus != null &&
    LIVE_BOOKING_STATUSES_FOR_SESSION_UI.has(params.bookingStatus)
  ) {
    return false;
  }

  if (isLiveSessionDbStatus(params.sessionDbStatus)) return false;

  const dbStatus = params.sessionDbStatus?.toLowerCase() ?? "";
  if (PARENT_REVIEW_SESSION_DB_STATUSES.has(dbStatus)) return true;
  return params.sessionPaymentStatus === "pending_payment";
}

function selectParentDashboardCenterView(params: {
  bookingGuardReady: boolean;
  sessionHydrateError: boolean;
  bookingStatus: BookingStatus | null | undefined;
  sessionDbStatus: string | null;
  sessionProtocolStatus: SessionProtocolState["status"];
  sessionClosureEligible: boolean;
  sessionPaymentStatus?: string | null;
}): ParentDashboardCenterView {
  if (!params.bookingGuardReady) return "loading";
  if (params.sessionHydrateError) return "idle";

  if (params.bookingStatus === "pending" || params.sessionDbStatus?.toLowerCase() === "matching") {
    return "matching";
  }

  const inProgress =
    params.sessionProtocolStatus === "active" ||
    params.sessionProtocolStatus === "parent_initiated" ||
    isLiveSessionDbStatus(params.sessionDbStatus) ||
    (params.bookingStatus != null &&
      LIVE_BOOKING_STATUSES_FOR_SESSION_UI.has(params.bookingStatus));

  if (inProgress) return "in_progress";

  const reviewAllowed = isParentReviewPaySessionAllowed(params);
  if (reviewAllowed && (params.sessionClosureEligible || params.sessionProtocolStatus === "ended")) {
    return "review_pay";
  }

  if (
    params.bookingStatus &&
    !isBookingTerminalStatus(params.bookingStatus) &&
    params.bookingStatus !== "pending"
  ) {
    return "shift";
  }

  return "idle";
}

/** True when today's linked booking should drive Double-Shake / hide home shortcuts. */
function isParentShiftBookingActionable(
  booking: TodaysLinkedBookingView | null,
  status: BookingStatus | "",
  nowMs: number
): boolean {
  if (!booking || !status) return false;
  if (isBookingTerminalStatus(status)) return false;
  if (isShiftLocallyDismissed(booking.id)) return false;

  const isToday = isBookingDateToday(String(booking.booking_date ?? ""));

  if (status === "pending") {
    return isToday;
  }

  if (status === "approved") {
    const window = resolveBookingWindowMs(booking, nowMs);
    if (!window) return isToday;
    return nowMs <= window.endMs;
  }

  if (status === "sitter_started") {
    return isNowWithinShiftActivationWindow(booking, nowMs);
  }

  if (status === "parent_started" || status === "sitter_ended") {
    return isNowWithinBookingWindow(booking, nowMs);
  }

  return false;
}

function localizeCheckoutError(message: string): string {
  const trimmed = message.trim();
  if (trimmed === "Booking not found.") {
    return "לא נמצאה משמרת לתשלום — נסו שוב בעוד רגע.";
  }
  if (trimmed === "bookingId is required.") {
    return "ממתינים לפרטי משמרת…";
  }
  return trimmed;
}

export default function ParentDashboardPage() {
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
  const [closureError, setClosureError] = useState<string | null>(null);
  const [closureBookingVerify, setClosureBookingVerify] = useState<ClosureBookingVerifyState>("idle");
  const [bookingPaymentStatus, setBookingPaymentStatus] = useState<"unknown" | "paid" | "unpaid">("unknown");
  const [payBusy, setPayBusy] = useState(false);
  const [closureSitterReviews, setClosureSitterReviews] = useState<PublicSitterReview[]>([]);
  const [shiftFinishedLocked, setShiftFinishedLocked] = useState(false);
  const [parentSessionView, setParentSessionView] = useState<ParentSessionView>("idle");
  const [sessionDbStatus, setSessionDbStatus] = useState<string | null>(null);
  const [sessionHydrateError, setSessionHydrateError] = useState(false);
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

  const { circleBooking, syncFromPayload, syncFromLinkedBooking, applyCircleBooking, bookingRef } =
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
    } else if (
      status === "pending" ||
      status === "approved" ||
      status === "sitter_started" ||
      status === "parent_started" ||
      status === "sitter_ended"
    ) {
      setBookingShiftRejectedNotice(false);
    }
  }, []);

  const notifyBookingTransition = useCallback(
    (rowStatus: BookingStatus, source: "realtime" | "reload" | "gate") => {
      if (isParentBookingRejection(rowStatus)) {
        applyCircleBooking(null);
        applyBookingShiftNotice(rowStatus);
        setBookingFeedbackVariant("error");
        setBookingFeedbackToast(BOOKING_SHIFT_REJECTED_NOTICE);
        return;
      }

      if (isParentBookingApprovalStatus(rowStatus)) {
        applyBookingShiftNotice("approved");
        if (source !== "reload") {
          setBookingFeedbackVariant("success");
          setBookingFeedbackToast(BOOKING_SHIFT_APPROVED_TOAST);
        }
        return;
      }

      if (isParentBookingTrackingStatus(rowStatus)) {
        applyBookingShiftNotice(rowStatus);
      }
    },
    [applyBookingShiftNotice, applyCircleBooking]
  );

  const handleBookingLiveSync = useCallback(
    (payload: TodaysLinkedBookingSyncPayload) => {
      const incomingStatus = normalizeBookingStatus(
        payload.row?.status ?? payload.booking?.status ?? payload.shiftGate?.status
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

      const rowStatus = normalizeBookingStatus(
        payload.row?.status ?? payload.booking?.status ?? payload.shiftGate?.status
      );
      if (!rowStatus) return;

      const prevStatus = prevShiftGateStatusRef.current;
      const statusChanged = Boolean(prevStatus && prevStatus !== rowStatus);

      if (isParentBookingRejection(rowStatus)) {
        notifyBookingTransition(rowStatus, payload.source === "reload" ? "reload" : "realtime");
        return;
      }

      if (rowStatus === "pending") {
        applyBookingShiftNotice("pending");
        if (payload.booking) {
          applyCircleBooking(payload.booking);
        } else if (payload.row) {
          const prev = bookingRef.current ?? todaysBookingRef.current;
          applyCircleBooking(bookingRowToCircleView(payload.row, prev, "parent"));
        }
        return;
      }

      if (
        isParentBookingTrackingStatus(rowStatus) &&
        (statusChanged || payload.source === "realtime" || payload.liveFieldsChanged)
      ) {
        if (payload.row && isParentBookingTrackingStatus(payload.row.status)) {
          const prev = bookingRef.current ?? todaysBookingRef.current;
          const view = bookingRowToCircleView(payload.row, prev, "parent");
          const normalized = normalizeBookingStatus(payload.row.status) ?? "";
          if (isParentShiftBookingActionable(view, normalized, Date.now())) {
            applyCircleBooking(view);
          }
        } else if (payload.booking) {
          const normalized = normalizeBookingStatus(payload.booking.status) ?? "";
          if (isParentShiftBookingActionable(payload.booking, normalized, Date.now())) {
            applyCircleBooking(payload.booking);
          }
        }

        notifyBookingTransition(rowStatus, payload.source === "reload" ? "reload" : "realtime");
      }
    },
    [
      breakCompletedRealtimeLoop,
      syncFromPayload,
      syncFromLinkedBooking,
      notifyBookingTransition,
      applyCircleBooking,
      bookingRef
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

  const sessionStatus = sessionState.status;
  const sessionLinkedBookingId = sessionState.linkedBookingId ?? "";
  const sessionSupabaseSessionId = sessionState.supabaseSessionId ?? "";

  const todaysBookingId =
    todaysBooking?.id ??
    circleBooking?.id ??
    todayBookingShiftGate?.id ??
    sessionLinkedBookingId ??
    "";
  const todaysBookingStatus =
    normalizeBookingStatus(
      todaysBooking?.status ?? todayBookingShiftGate?.status ?? circleBooking?.status
    ) ?? "";
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

  const todaysBookingRef = useRef(todaysBooking);
  todaysBookingRef.current = todaysBooking;
  const todaysBookingStatusRef = useRef(todaysBookingStatus);
  todaysBookingStatusRef.current = todaysBookingStatus;

  const applyParentTrackingCircleFromRow = useCallback(
    (row: BookingRow) => {
      if (isParentBookingRejection(row.status)) {
        applyCircleBooking(null);
        return;
      }

      if (!isParentBookingTrackingStatus(row.status)) {
        return;
      }

      const normalized = normalizeBookingStatus(row.status) ?? "";
      const prev = bookingRef.current ?? todaysBookingRef.current;
      const view = bookingRowToCircleView(row, prev, "parent");
      if (!isParentShiftBookingActionable(view, normalized, Date.now())) {
        return;
      }

      applyCircleBooking(view);
    },
    [applyCircleBooking, bookingRef]
  );

  const isParentPendingLocked = useMemo(
    () =>
      !bookingShiftRejectedNotice &&
      (shiftGateStatus === "pending" ||
        todaysBookingStatus === "pending" ||
        circleBookingStatus === "pending"),
    [bookingShiftRejectedNotice, shiftGateStatus, todaysBookingStatus, circleBookingStatus]
  );

  useEffect(() => {
    setShiftUiLocked(isShiftLocallyDismissed(todaysBookingId));
  }, [todaysBookingId]);

  useEffect(() => {
    if (todaysBookingStatus === "completed") {
      breakCompletedRealtimeLoop("sync");
      return;
    }
    if (bookingGuardReady && todaysBookingId && !isShiftLocallyDismissed(todaysBookingId)) {
      setShiftUiLocked(false);
    }
  }, [todaysBookingStatus, todaysBookingId, bookingGuardReady, breakCompletedRealtimeLoop]);

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

  /** Hydrate shift circle after refresh when gate exists but enriched row is missing. */
  useEffect(() => {
    if (!bookingGuardReady || !parentUserId) return;
    if (idleCircleBooking) return;

    const status = normalizeBookingStatus(
      shiftGateStatus || todaysBookingStatus || circleBookingStatus || undefined
    );
    const needsHydrate =
      status === "pending" ||
      isParentBookingTrackingStatus(status) ||
      isParentBookingApprovalStatus(status);
    if (!needsHydrate) return;

    const supabase = getSupabaseBrowserClient();
    const bookingId = todayBookingShiftGate?.id ?? todaysBookingId;
    if (!supabase || !bookingId) return;

    let cancelled = false;
    void fetchLinkedBookingById(supabase, bookingId, "parent")
      .then((booking) => {
        if (!cancelled && booking) {
          applyCircleBooking(booking);
        }
      })
      .catch((error) => {
        console.warn("[parent] hydrate linked booking:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [
    bookingGuardReady,
    parentUserId,
    idleCircleBooking,
    shiftGateStatus,
    todaysBookingStatus,
    circleBookingStatus,
    todayBookingShiftGate?.id,
    todaysBookingId,
    applyCircleBooking
  ]);

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

  const todaysBookingStatusNormalized = useMemo(
    () =>
      normalizeBookingStatus(
        todaysBooking?.status ?? todayBookingShiftGate?.status ?? circleBooking?.status
      ),
    [todaysBooking?.status, todayBookingShiftGate?.status, circleBooking?.status]
  );

  const closureBookingId = useMemo(
    () =>
      resolveParentClosureBookingId(
        sessionLinkedBookingId,
        todaysBookingId,
        todaysBookingStatusNormalized
      ),
    [sessionLinkedBookingId, todaysBookingId, todaysBookingStatusNormalized]
  );

  const sessionClosureEligible = useMemo(
    () =>
      canShowParentSessionClosure({
        sessionState,
        completedSummary,
        bookingStatus: todaysBookingStatusNormalized
      }),
    [sessionState, completedSummary, todaysBookingStatusNormalized]
  );

  const parentDashboardCenterView = useMemo(
    () =>
      selectParentDashboardCenterView({
        bookingGuardReady,
        sessionHydrateError,
        bookingStatus: todaysBookingStatusNormalized,
        sessionDbStatus,
        sessionProtocolStatus: sessionState.status,
        sessionClosureEligible,
      }),
    [
      bookingGuardReady,
      sessionHydrateError,
      todaysBookingStatusNormalized,
      sessionDbStatus,
      sessionState.status,
      sessionClosureEligible
    ]
  );

  const showParentSessionClosure = parentDashboardCenterView === "review_pay";
  const parentSessionInProgress = parentDashboardCenterView === "in_progress";

  const effectiveClosureSummary = useMemo(() => {
    if (!showParentSessionClosure) return completedSummary;
    if (completedSummary) return completedSummary;
    const endMs = sessionState.endedAtMs ?? Date.now();
    const startMs = sessionState.parentStartedAtMs ?? endMs;
    const finalSeconds =
      sessionState.finalElapsedSeconds ??
      Math.max(0, Math.floor((endMs - startMs) / 1000));
    const amountNis =
      sessionState.finalAmountNis ??
      Number(((finalSeconds / 3600) * HOURLY_RATE).toFixed(2));
    return { elapsedSeconds: finalSeconds, amountNis };
  }, [completedSummary, showParentSessionClosure, sessionState]);

  const buildParentSessionFinishedState = useCallback(
    (prev: SessionProtocolState, row?: SupabaseSessionRow | null): SessionProtocolState => {
      const endMs = row?.end_time ? new Date(row.end_time).getTime() : Date.now();
      const startMs =
        prev.parentStartedAtMs ??
        (row?.start_time ? new Date(row.start_time).getTime() : endMs);
      const finalSeconds =
        row?.final_elapsed_seconds != null
          ? Math.max(0, Math.floor(Number(row.final_elapsed_seconds)))
          : Math.max(0, Math.floor((endMs - startMs) / 1000));
      const finalAmountNis =
        row?.final_amount_nis != null
          ? Number(row.final_amount_nis)
          : Number(((finalSeconds / 3600) * HOURLY_RATE).toFixed(2));
      return {
        status: "ended",
        parentStartedAtMs: startMs,
        endedAtMs: endMs,
        finalElapsedSeconds: finalSeconds,
        finalAmountNis: finalAmountNis,
        linkedBookingId:
          prev.linkedBookingId ??
          readSessionLinkedBookingId(row ?? null, todaysBookingId) ??
          (todaysBookingId || undefined),
        supabaseSessionId:
          prev.supabaseSessionId ?? (row?.id != null ? String(row.id) : undefined)
      };
    },
    [todaysBookingId]
  );

  useEffect(() => {
    try {
      if (!showParentSessionClosure) {
        setClosureSitterReviews([]);
        return;
      }

      const sitterId =
        idleCircleBooking?.sitter_id?.trim() || todaysBooking?.sitter_id?.trim() || "";
      if (!sitterId) {
        setClosureSitterReviews([]);
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setClosureSitterReviews([]);
        return;
      }

      let cancelled = false;

      void (async () => {
        try {
          const { data: reviewsRaw, error: revErr } = await supabase.rpc("get_sitter_public_reviews", {
            p_sitter_id: sitterId,
            p_limit: 3
          });
          if (cancelled) return;
          if (revErr) {
            setClosureSitterReviews([]);
            return;
          }
          setClosureSitterReviews(Array.isArray(reviewsRaw) ? (reviewsRaw as PublicSitterReview[]) : []);
        } catch {
          if (!cancelled) setClosureSitterReviews([]);
        }
      })();

      return () => {
        cancelled = true;
      };
    } catch {
      setClosureSitterReviews([]);
    }
  }, [
    showParentSessionClosure,
    idleCircleBooking?.sitter_id,
    todaysBooking?.sitter_id
  ]);

  useEffect(() => {
    if (showParentSessionClosure) {
      setParentSessionView("review_pay");
      return;
    }
    if (parentSessionView === "review_pay") {
      setParentSessionView("idle");
      setShiftFinishedLocked(false);
    }
  }, [showParentSessionClosure, parentSessionView]);


  const handleConfirmAndPay = useCallback(
    async (rating: number) => {
      const sid = sessionSupabaseSessionId?.trim();
      const bid = closureBookingId.trim();
      if (!sid) {
        setClosureError("לא נמצא סשן לדירוג.");
        return;
      }
      if (!bid || closureBookingVerify !== "ready") {
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setClosureError("Supabase לא מוגדר.");
        return;
      }

      setPayBusy(true);
      setClosureError(null);
      setDbBanner(null);

      const ratingResult = await submitSessionRating(supabase, {
        sessionId: sid,
        role: "parent",
        rating
      });
      if (!ratingResult.ok) {
        setClosureError(ratingResult.error);
        setPayBusy(false);
        return;
      }

      const amountNis = completedSummary?.amountNis ?? sessionState.finalAmountNis ?? 0;
      const amountMinorUnits = Math.max(50, Math.round(Number(amountNis) * 100));
      try {
        const result = await postStripeCheckoutSession({
          bookingId: bid,
          amountMinorUnits,
          currency: "ils",
          description: "תשלום משמרת AnyNanny"
        });
        if (!result.ok) {
          setClosureError(localizeCheckoutError(result.error));
          setPayBusy(false);
          return;
        }
        window.location.assign(result.url);
      } catch (e) {
        console.error("[parent] Stripe checkout:", e);
        setClosureError("שגיאה בפתיחת התשלום. נסו שוב.");
        setPayBusy(false);
      }
    },
    [
      sessionSupabaseSessionId,
      closureBookingId,
      closureBookingVerify,
      sessionState.finalAmountNis,
      completedSummary
    ]
  );

  const handleCheckoutReturnIdle = useCallback(() => {
    const bookingId = sessionLinkedBookingId || todaysBookingId;
    if (bookingId) {
      persistShiftLocallyDismissed(bookingId);
    }
    lockShiftUi(bookingId);
    const sid = sessionSupabaseSessionId;
    if (sid) {
      dismissCompletedSession(sid, "parent");
    }
    persistSessionState({ status: "idle" });
    setSessionState({ status: "idle" });
    setShiftFinishedLocked(false);
    setParentSessionView("idle");
    setSessionDbStatus(null);
    setClosureSitterReviews([]);
    setClosureError(null);
    setNowMs(Date.now());
  }, [sessionSupabaseSessionId, sessionLinkedBookingId, todaysBookingId, lockShiftUi]);

  useEffect(() => {
    if (isShiftLocallyDismissed(todaysBookingId)) {
      return;
    }
    if (shiftUiLocked && sessionStatus !== "ended") {
      return;
    }
    if (shiftCompletedFrozenRef.current || todaysBookingStatus === "completed") {
      breakCompletedRealtimeLoop("sync");
      return;
    }
    if (!todaysBookingId) return;
    syncFromLinkedBooking(todaysBookingRef.current);
  }, [bookingSyncKey, syncFromLinkedBooking, breakCompletedRealtimeLoop, todaysBookingStatus, todaysBookingId, shiftUiLocked, sessionStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get("checkout");
    if (c === "success") {
      setDbBanner("התשלום הושלם בהצלחה.");
      setStripeCheckoutNonce((n) => n + 1);
      handleCheckoutReturnIdle();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (c === "cancel") {
      setDbBanner("התשלום בוטל. ניתן לנסות שוב בכל עת.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [handleCheckoutReturnIdle]);

  useEffect(() => {
    if (!debugToast) return;
    const t = window.setTimeout(() => setDebugToast(null), 3800);
    return () => window.clearTimeout(t);
  }, [debugToast]);

  /** Toast when sitter approves/rejects today's booking (via shiftGate refetch). */
  useEffect(() => {
    const next = shiftGateStatus || null;
    const prev = prevShiftGateStatusRef.current;
    prevShiftGateStatusRef.current = next;

    if (!next || !prev || prev === next) return;

    if (prev === "pending" && next === "approved") {
      notifyBookingTransition("approved", "gate");
      return;
    }

    if (
      prev === "pending" &&
      (next === "parent_started" || next === "sitter_started" || next === "sitter_ended")
    ) {
      notifyBookingTransition(next, "gate");
      return;
    }

    if (prev === "pending" && (next === "rejected" || next === "cancelled")) {
      notifyBookingTransition(next, "gate");
    }
  }, [shiftGateStatus, notifyBookingTransition]);

  /** Sync inline notice from latest today booking row (survives linked-booking refetch). */
  useEffect(() => {
    applyBookingShiftNotice(shiftGateStatus || undefined);
  }, [shiftGateStatus, applyBookingShiftNotice]);

  /** Re-hydrate booking state when tab regains focus or parent auth becomes available. */
  useEffect(() => {
    if (!parentUserId) return;

    void reloadTodaysBooking();

    const refreshFromDb = () => {
      void reloadTodaysBooking();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshFromDb();
      }
    };

    window.addEventListener("focus", refreshFromDb);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshFromDb);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [parentUserId, reloadTodaysBooking]);

  /** Parent bookings realtime — `event: '*'` on bookings; immediate circle + notice updates. */
  useEffect(() => {
    if (shiftCompletedFrozenRef.current || todaysBookingStatus === "completed") {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase || !parentUserId) return;

    const handleRowChange = (payload: RealtimePostgresChangesPayload<BookingRow>) => {
      const row = readBookingRowFromRealtimeChange(payload);
      if (!row || String(row.parent_id) !== parentUserId) return;

      const rowStatus = normalizeBookingStatus(row.status);
      if (!rowStatus) return;

      if (
        rowStatus === "completed" ||
        todaysBookingStatusRef.current === "completed" ||
        shiftCompletedFrozenRef.current
      ) {
        breakCompletedRealtimeLoop("realtime");
        return;
      }

      if (isParentBookingRejection(row.status)) {
        applyCircleBooking(null);
        notifyBookingTransition(rowStatus, "realtime");
        void reloadTodaysBooking();
        return;
      }

      if (isParentBookingTrackingStatus(row.status)) {
        applyParentTrackingCircleFromRow(row);
        notifyBookingTransition(rowStatus, "realtime");
        void reloadTodaysBooking();
        return;
      }

      void reloadTodaysBooking();
    };

    const channel = supabase
      .channel(`parent-dashboard-bookings-${parentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
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
  }, [
    parentUserId,
    todaysBookingStatus,
    reloadTodaysBooking,
    notifyBookingTransition,
    breakCompletedRealtimeLoop,
    applyCircleBooking,
    applyParentTrackingCircleFromRow
  ]);

  useEffect(() => {
    if (!showParentSessionClosure || bookingPaymentStatus === "paid") {
      setClosureBookingVerify("idle");
      setClosureError(null);
      return;
    }

    const bid = closureBookingId.trim();
    if (!bid) {
      setClosureBookingVerify("unavailable");
      setClosureError(null);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setClosureBookingVerify("unavailable");
      return;
    }

    let cancelled = false;
    setClosureBookingVerify("checking");
    setClosureError(null);

    void (async () => {
      const read = safeSupabaseRead(
        await supabase.from(BOOKINGS_TABLE).select("id, status").eq("id", bid).maybeSingle(),
        "closure booking verify"
      );

      if (cancelled) return;

      if (read.error || !read.data) {
        setClosureBookingVerify(read.schemaDrift ? "ready" : "unavailable");
        return;
      }

      const status = normalizeBookingStatus((read.data as BookingRow).status);
      if (status === "rejected" || status === "cancelled") {
        setClosureBookingVerify("unavailable");
        return;
      }

      setClosureBookingVerify("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [showParentSessionClosure, closureBookingId, bookingPaymentStatus, todaysBookingUpdatedAt]);

  useEffect(() => {
    if (sessionStatus !== "ended") {
      setBookingPaymentStatus("unknown");
      return;
    }
    const bid = closureBookingId.trim();
    if (!bid) {
      setBookingPaymentStatus("unpaid");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setBookingPaymentStatus("unknown");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const status = await fetchBookingPaymentStatus(supabase, bid);
        if (!cancelled) setBookingPaymentStatus(status === "paid" ? "paid" : "unpaid");
      } catch {
        if (!cancelled) setBookingPaymentStatus("unpaid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionStatus, closureBookingId, stripeCheckoutNonce]);

  /** Preserve post-shift `ended` state for rating/payment — do not reset while closure is pending. */
  useEffect(() => {
    if (!bookingGuardReady) return;

    const liveStatuses = new Set<BookingStatus>([
      "pending",
      "approved",
      "sitter_started",
      "parent_started",
      "in_progress",
      "sitter_ended"
    ]);
    const bookingStatus = todaysBookingStatusNormalized;
    const hasLiveBooking =
      Boolean(todaysBookingId) && bookingStatus != null && liveStatuses.has(bookingStatus);

    if (sessionStatus === "ended") {
      if (
        hasLiveBooking &&
        !isParentReviewPaySessionAllowed({
          bookingGuardReady,
          sessionHydrateError,
          bookingStatus,
          sessionDbStatus,
          sessionProtocolStatus: sessionStatus
        })
      ) {
        const idle: SessionProtocolState = { status: "idle" };
        persistSessionState(idle);
        setSessionState(idle);
        setShiftFinishedLocked(false);
        setParentSessionView("idle");
        setSessionDbStatus(null);
        setNowMs(Date.now());
      }
      return;
    }

    if (hasLiveBooking) return;

    if (
      (sessionStatus === "active" || sessionStatus === "parent_initiated") &&
      sessionState.parentStartedAtMs
    ) {
      return;
    }

    if (shiftGateStatus === "pending") return;

    const idle: SessionProtocolState = { status: "idle" };
    persistSessionState(idle);
    setSessionState(idle);
    setNowMs(Date.now());
  }, [
    bookingGuardReady,
    todaysBookingId,
    todaysBookingStatusNormalized,
    sessionStatus,
    shiftGateStatus,
    sessionState.parentStartedAtMs,
    sessionHydrateError,
    sessionDbStatus
  ]);

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
    if (shiftUiLocked || isShiftLocallyDismissed(todaysBookingId)) {
      return;
    }
    if (!parentUserId || !bookingGuardReady) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;

    void (async () => {
      try {
        setSessionHydrateError(false);
        let local: SessionProtocolState = { status: "idle" };
        try {
          local = reconcileStaleEndedLocalState(
            readSessionState(),
            normalizeBookingStatus(todaysBooking?.status)
          );
        } catch {
          /* ignore */
        }

        if (todaysBookingStatus === "completed") {
          lockShiftUi(todaysBookingId);
          if (isShiftLocallyDismissed(todaysBookingId)) {
            const idle: SessionProtocolState = { status: "idle" };
            persistSessionState(idle);
            if (!cancelled) setSessionState(idle);
            return;
          }

          const dismissedId = readDismissedCompletedSessionId("parent");
          const row = await fetchRelevantParentSessionRow(
            supabase,
            parentUserId,
            todaysBookingId,
            "completed"
          );
          if (cancelled) return;

          if (row) {
            const merged = mergeParentSessionFromDbRow(row, {
              dismissedCompletedSessionId: dismissedId,
              todaysBookingId,
              localState: local,
              bookingStatus: "completed"
            });
            if (merged) {
              persistSessionState(merged);
              if (!cancelled) setSessionState(merged);
              return;
            }
          }

          if (local.status === "ended") {
            if (!cancelled) setSessionState(local);
          }
          return;
        }

        if (shiftCompletedFrozenRef.current) {
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

        const row = await fetchRelevantParentSessionRow(
          supabase,
          parentUserId,
          todaysBookingId,
          todaysBookingStatusNormalized
        );

        if (cancelled) return;

        if (row) {
          const dismissedId = readDismissedCompletedSessionId("parent");
          const merged = mergeParentSessionFromDbRow(row, {
            dismissedCompletedSessionId: dismissedId,
            todaysBookingId,
            localState: local,
            bookingStatus: todaysBookingStatusNormalized
          });
          if (merged) {
            const rowDbStatus = String(row.status);
            setSessionDbStatus(rowDbStatus);
            if (
              !cancelled &&
              isParentReviewPaySessionAllowed({
                bookingGuardReady: true,
                sessionHydrateError: false,
                bookingStatus: todaysBookingStatusNormalized,
                sessionDbStatus: rowDbStatus,
                sessionProtocolStatus: merged.status
              })
            ) {
              setShiftFinishedLocked(true);
              setParentSessionView("review_pay");
            }
            persistSessionState(merged);
            if (!cancelled) setSessionState(merged);
          }
        } else if (local.status === "active" || local.status === "parent_initiated") {
          const idle: SessionProtocolState = { status: "idle" };
          persistSessionState(idle);
          if (!cancelled) setSessionState(idle);
        }
      } catch (e) {
        console.warn("[parent] session hydrate error:", e);
        setSessionHydrateError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [parentUserId, bookingGuardReady, todaysBookingId, todaysBookingStatus, shiftUiLocked, lockShiftUi]);

  /** Prefer row id when known so parent_end_requested_at updates arrive instantly for that session. */
  useEffect(() => {
    if (
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
        const row = rowData as SupabaseSessionRow;
        const rowDbStatus = String(row.status);
        const sitterFinished =
          PARENT_REVIEW_SESSION_DB_STATUSES.has(rowDbStatus.toLowerCase()) &&
          row.end_time != null &&
          isParentReviewPaySessionAllowed({
            bookingGuardReady,
            sessionHydrateError,
            bookingStatus: todaysBookingStatusNormalized,
            sessionDbStatus: rowDbStatus,
            sessionProtocolStatus: sessionState.status
          });
        if (sitterFinished) {
          setSessionDbStatus(rowDbStatus);
          setParentSessionView("review_pay");
          setSessionState((prev) => {
            if (prev.status === "ended") return prev;
            const next = buildParentSessionFinishedState(prev, row);
            persistSessionState(next);
            return next;
          });
          setShiftFinishedLocked(true);
          lockShiftUi(todaysBookingId);
          setNowMs(Date.now());
          return;
        }
        setSessionDbStatus(rowDbStatus);
        setSessionState((prev) => {
          if (prev.status === "ended") {
            return prev;
          }
          const merged = mergeParentSessionFromDbRow(row, {
            dismissedCompletedSessionId: dismissedId,
            todaysBookingId,
            localState: prev,
            bookingStatus: todaysBookingStatusNormalized
          });
          if (!merged) return prev;
          persistSessionState(merged);
          return merged;
        });
      } catch (e) {
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
  }, [
    parentUserId,
    sessionSupabaseSessionId,
    todaysBookingStatus,
    todaysBookingId,
    shiftUiLocked,
    todaysBookingStatusNormalized,
    buildParentSessionFinishedState,
    lockShiftUi,
    bookingGuardReady,
    sessionHydrateError,
    sessionState.status
  ]);

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
    setStartShiftBusy(true);
    setDbBanner(null);
    setUseSupabase(true);
    setParentUserId(auth.userId);

    const resetLocalSessionIdle = (message: string) => {
      const idle: SessionProtocolState = { status: "idle" };
      persistSessionState(idle);
      setSessionState(idle);
      setNowMs(Date.now());
      setDbBanner(message);
    };

    try {
      if (bookingStatus === "sitter_started") {
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
      const isArrivalConfirm = bookingStatus === "sitter_started";

      let row: SupabaseSessionRow | null = null;
      let lastError: string | null = null;

      if (isArrivalConfirm) {
        const activated = await activateParentConfirmedSession(auth.supabase, {
          parentId: auth.userId,
          sitterId: linkedSitterId,
          bookingId: preservedBooking.id,
          startIso
        });
        row = activated.row;
        lastError = activated.error;
      } else {
        const sessionInserts: Record<string, unknown>[] = [
          {
            parent_id: auth.userId,
            sitter_id: linkedSitterId,
            status: "pending",
            start_time: startIso
          },
          {
            parent_id: auth.userId,
            sitter_id: linkedSitterId,
            status: "active",
            start_time: startIso,
            start_confirmed: true
          }
        ];

        for (const insertBase of sessionInserts) {
          const ins = await insertSessionReturningRow(auth.supabase, insertBase);
          if (ins.row) {
            row = ins.row;
            break;
          }
          lastError = ins.error;
        }
      }

      if (row) {
        const mapped = mapSupabaseRowToProtocol(row);
        const isPendingStart = SESSION_PENDING_START_STATUSES.includes(String(row.status));
        const next: SessionProtocolState = mapped
          ? {
              ...mapped,
              status: isPendingStart ? "parent_initiated" : "active",
              parentStartedAtMs: isPendingStart ? undefined : mapped.parentStartedAtMs ?? startedAtMs,
              linkedBookingId: mapped.linkedBookingId ?? preservedBooking.id,
              startConfirmed: !isPendingStart
            }
          : isPendingStart
            ? {
                status: "parent_initiated",
                linkedBookingId: preservedBooking.id,
                supabaseSessionId: String(row.id)
              }
            : {
                status: "active",
                parentStartedAtMs: startedAtMs,
                linkedBookingId: preservedBooking.id,
                supabaseSessionId: String(row.id),
                startConfirmed: true
              };
        persistSessionState(next);
        setSessionState(next);
        setNowMs(Date.now());
        setDebugToast(isPendingStart ? "בקשת התחלה נשלחה לבייביסיטר" : "המשמרת התחילה");
      } else {
        console.warn("[parent] session insert failed:", lastError);
        resetLocalSessionIdle(
          friendlySupabaseSessionError(lastError ?? "לא ניתן לסנכרן את המשמרת לשרת.")
        );
      }
    } catch (e) {
      console.error("[parent] startSession:", e);
      applyCircleBooking(preservedBooking);
      resetLocalSessionIdle(
        friendlySupabaseSessionError(e ?? "לא ניתן לפתוח משמרת — נסו שוב.")
      );
    } finally {
      setStartShiftBusy(false);
    }
  };

  const handleConfirmShiftStartClick = () => {
    void startSession();
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
        const read = await updateSessionReturningRow(
          auth.supabase,
          sessionState.supabaseSessionId,
          { parent_end_requested_at: reqAt },
          { parentId: auth.userId }
        );
        if (!read.error && read.row) {
          const mapped = mapSupabaseRowToProtocol(read.row);
          if (mapped) {
            persistSessionState(mapped);
            setSessionState(mapped);
            setDbBanner(null);
            setDebugToast("Request sent to Sitter");
            return;
          }
        }
        if (read.error) {
          console.error("[parent] request end failed:", read.error);
          setDbBanner(friendlySupabaseSessionError({ message: read.error }));
        }
      } catch (e) {
        console.error("[parent] endSession:", e);
        setDbBanner(friendlySupabaseSessionError(e));
      }
    }
  };

  const waitingNannyStart = sessionState.status === "parent_initiated";
  const waitingNannyEnd =
    sessionState.status === "active" && sessionState.parentEndRequestedAtMs != null;

  const parentShiftStatus = useMemo(
    () =>
      normalizeBookingStatus(
        circleBookingStatus ||
          todaysBookingStatus ||
          shiftGateStatus ||
          undefined
      ),
    [circleBookingStatus, todaysBookingStatus, shiftGateStatus]
  );

  const isParentApprovedShift = isParentBookingApprovalStatus(parentShiftStatus);
  const isParentTrackingShift = isParentBookingTrackingStatus(parentShiftStatus);

  const hasActionableShiftBooking = useMemo(
    () =>
      !showParentSessionClosure &&
      !parentSessionInProgress &&
      sessionState.status !== "ended" &&
      isParentShiftBookingActionable(idleCircleBooking, parentShiftStatus, nowMs),
    [
      showParentSessionClosure,
      parentSessionInProgress,
      sessionState.status,
      idleCircleBooking,
      parentShiftStatus,
      nowMs
    ]
  );

  const effectiveSessionStatus: SessionProtocolState["status"] = sessionState.status;

  /** Drop stale in-flight rows (e.g. old `sitter_started`) so home shortcuts return on mount. */
  useEffect(() => {
    if (!bookingGuardReady || showParentSessionClosure) return;
    if (effectiveSessionStatus !== "idle") return;

    const booking = idleCircleBooking;
    if (!booking) return;

    const status = normalizeBookingStatus(booking.status);
    if (!status || status === "pending") return;
    if (isParentShiftBookingActionable(booking, status, nowMs)) return;

    applyCircleBooking(null);
  }, [
    bookingGuardReady,
    showParentSessionClosure,
    effectiveSessionStatus,
    idleCircleBooking,
    nowMs,
    applyCircleBooking
  ]);

  const showParentPendingNotice = isParentPendingLocked;

  const showParentApprovedNotice =
    !bookingShiftRejectedNotice &&
    !showParentPendingNotice &&
    isParentApprovedShift &&
    hasActionableShiftBooking;

  const sessionRunning =
    !sessionUiBlockedByBooking &&
    !showParentSessionClosure &&
    effectiveSessionStatus !== "ended" &&
    (effectiveSessionStatus === "active" || effectiveSessionStatus === "parent_initiated");

  const hideSearchShortcuts =
    isParentPendingLocked ||
    sessionRunning ||
    showParentSessionClosure ||
    waitingNannyStart ||
    waitingNannyEnd ||
    (hasActionableShiftBooking &&
      !bookingShiftRejectedNotice &&
      todaysBookingStatus !== "rejected" &&
      todaysBookingStatus !== "cancelled");

  const handleDismissRejectedNotice = useCallback(() => {
    setBookingShiftRejectedNotice(false);
    setBookingFeedbackToast(null);
  }, []);

  const showParentShiftCircle =
    !showParentSessionClosure &&
    !parentSessionInProgress &&
    !bookingShiftRejectedNotice &&
    effectiveSessionStatus !== "active" &&
    effectiveSessionStatus !== "parent_initiated" &&
    hasActionableShiftBooking;

  const showShiftPanel =
    showParentSessionClosure ||
    parentSessionInProgress ||
    sessionRunning ||
    waitingNannyStart ||
    waitingNannyEnd ||
    bookingShiftRejectedNotice ||
    showParentPendingNotice ||
    showParentApprovedNotice ||
    hasActionableShiftBooking;

  const showParentActiveSessionCenter =
    effectiveSessionStatus === "active" &&
    !waitingNannyEnd &&
    !showParentSessionClosure &&
    !sessionUiBlockedByBooking;

  const showParentEmergencyReset =
    sessionRunning ||
    waitingNannyEnd ||
    showParentSessionClosure ||
    sessionState.status === "ended" ||
    shiftUiLocked;

  const handleParentEmergencyReset = useCallback(async () => {
    const idle: SessionProtocolState = { status: "idle" };
    persistSessionState(idle);
    setSessionState(idle);
    setClosureError(null);
    setClosureBookingVerify("idle");
    setBookingPaymentStatus("unknown");
    setPayBusy(false);
    setShiftUiLocked(false);
    setShiftFinishedLocked(false);
    setParentSessionView("idle");
    setSessionDbStatus(null);
    setSessionHydrateError(false);
    setClosureSitterReviews([]);
    setNowMs(Date.now());
    shiftCompletedFrozenRef.current = false;
    await reloadTodaysBooking();
  }, [reloadTodaysBooking]);

  const inPaymentClosure =
    showParentSessionClosure &&
    bookingPaymentStatus !== "paid" &&
    closureBookingVerify !== "unavailable";

  const showLoading =
    clientHasSessionUser !== true && (clientHasSessionUser === null || (clientHasSessionUser === false && authLoading));

  if (showLoading) {
    return (
      <main
        className="mx-auto flex h-full min-h-0 w-full max-w-md items-center justify-center bg-[#FDFBF6] py-10"
        dir="rtl"
      >
        <p className="text-right text-sm text-slate-600">{"טוען..."}</p>
      </main>
    );
  }

  return (
    <main
      className={`mx-auto flex h-full min-h-0 w-full max-w-md flex-col overflow-hidden bg-[#FDFBF6] py-2 ${inPaymentClosure ? "gap-2" : "space-y-4"}`}
      dir="rtl"
    >
      <div className="shrink-0">
        <DashboardWelcomeHeader fullName={fullName} nameLoading={greetingNameLoading} />
      </div>

      {dbBanner ? (
        <div
          role="status"
          className="flex shrink-0 flex-row-reverse items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-right text-sm text-amber-950"
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

      {inPaymentClosure || hideSearchShortcuts ? null : (
      <section className="shrink-0 rounded-3xl bg-white p-4 shadow-soft sm:p-5">
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
      )}

      {showShiftPanel ? (
      <DoubleShakeShiftPanel className={`min-h-0 flex-1 ${inPaymentClosure ? "!mt-0 !p-2 sm:!p-3" : ""}`}>
        <div
          className={`flex min-h-0 w-full flex-1 flex-col items-center overflow-hidden ${
            sessionRunning ? "justify-center gap-4 py-2" : "min-h-0"
          }`}
        >
          {sessionRunning ? (
            <div className="w-full shrink-0 space-y-1.5 px-1 text-right">
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
              className="mb-1 w-full shrink-0 rounded-2xl border-2 border-rose-400 bg-rose-50 px-4 py-3.5 text-right shadow-sm"
              role="alert"
              aria-live="assertive"
            >
              <p className="text-base font-bold leading-snug text-rose-950">{BOOKING_SHIFT_REJECTED_NOTICE}</p>
              <p className="mt-1 text-sm leading-snug text-rose-900">
                ניתן לחפש בייביסיטר אחרת או לנסות תאריך ושעה חדשים.
              </p>
              <div className="mt-3 flex flex-row-reverse flex-wrap gap-2">
                <Link
                  href="/parent/search"
                  className="rounded-xl bg-[#001F3F] px-4 py-2 text-xs font-bold text-white transition hover:brightness-110"
                >
                  חיפוש בייביסיטר
                </Link>
                <button
                  type="button"
                  onClick={handleDismissRejectedNotice}
                  className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-xs font-semibold text-rose-900 transition hover:bg-rose-100"
                >
                  סגור
                </button>
              </div>
            </div>
          ) : showParentPendingNotice ? (
            <div
              className="mb-1 w-full shrink-0 rounded-2xl border-2 border-sky-300 bg-sky-50 px-4 py-3.5 text-right shadow-sm"
              role="status"
              aria-live="polite"
            >
              <p className="text-base font-bold leading-snug text-sky-950">{BOOKING_SHIFT_PENDING_NOTICE}</p>
              <p className="mt-1 text-sm leading-snug text-sky-900/90">
                שלחנו את הבקשה לבייביסיטר — תקבלו עדכון כאן ברגע שתאשר או תדחה.
              </p>
              {idleCircleBooking?.schedule_label ? (
                <p className="mt-1 text-sm font-medium text-sky-900/90 tabular-nums">
                  {idleCircleBooking.schedule_label}
                </p>
              ) : null}
            </div>
          ) : showParentApprovedNotice ? (
            <div
              className="mb-1 w-full shrink-0 rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3.5 text-right shadow-sm"
              role="status"
              aria-live="polite"
            >
              <p className="text-base font-bold leading-snug text-emerald-950">{BOOKING_SHIFT_APPROVED_NOTICE}</p>
              <p className="mt-1 text-sm leading-snug text-emerald-900/90">
                הבייביסיטר אישרה את המשמרת — אפשר להתחיל כשיגיע זמן המשמרת.
              </p>
              {idleCircleBooking?.schedule_label ? (
                <p className="mt-1 text-sm font-medium text-emerald-900/90 tabular-nums">
                  {idleCircleBooking.schedule_label}
                </p>
              ) : null}
            </div>
          ) : null}

          <DoubleShakeCircleSlot
            align={inPaymentClosure ? "start" : "center"}
            pinToBottom={!sessionRunning}
            className={sessionRunning ? "!mt-0 pt-4" : undefined}
          >
          {showParentActiveSessionCenter ? (
            <div className="flex w-full flex-col items-center justify-center gap-4 pt-2">
              <ParentSessionTimerCircle
                timerText={timerText}
                amountLabel={`₪${earnedNis}`}
                variant="salmon"
              />
              <DoubleShakeCircleButton
                label="סיום משמרת"
                variant="salmon"
                onClick={() => void endSession()}
              />
            </div>
          ) : showParentSessionClosure && bookingPaymentStatus === "paid" ? (
            <p className="text-center text-sm font-semibold text-emerald-800">התשלום הושלם — תודה!</p>
          ) : showParentSessionClosure &&
            bookingPaymentStatus !== "paid" &&
            closureBookingVerify !== "unavailable" &&
            effectiveClosureSummary ? (
            <ParentSessionClosurePanel
              elapsedSeconds={effectiveClosureSummary.elapsedSeconds}
              amountNis={effectiveClosureSummary.amountNis}
              busy={payBusy}
              bookingChecking={closureBookingVerify === "checking"}
              bookingReady={closureBookingVerify === "ready"}
              errorMessage={closureError}
              onConfirmAndPay={handleConfirmAndPay}
            />
          ) : showParentShiftCircle ? (
            <ParentDoubleShakeIdleCircle
              key={parentCircleLiveKey}
              booking={idleCircleBooking}
              ready={bookingGuardReady}
              busy={startShiftBusy}
              sessionActive={effectiveSessionStatus === "active"}
              onStartShift={() => handleConfirmShiftStartClick()}
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
          ) : waitingNannyEnd && !showParentSessionClosure ? (
            <div className="mt-2 flex flex-col items-center justify-center pt-2">
              <DoubleShakeCircleButton
                label="ממתין לאישור סיום..."
                variant="waiting-salmon"
                presentational
              />
            </div>
          ) : parentSessionInProgress && (isParentTrackingShift || parentShiftStatus === "pending") ? (
            <ParentDoubleShakeIdleCircle
              key={parentCircleLiveKey}
              booking={idleCircleBooking}
              ready={bookingGuardReady}
              busy={startShiftBusy}
              sessionActive={effectiveSessionStatus === "active"}
              onStartShift={() => handleConfirmShiftStartClick()}
            />
          ) : null}
          </DoubleShakeCircleSlot>
        </div>
      </DoubleShakeShiftPanel>
      ) : null}

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

      {showParentEmergencyReset ? (
        <div className="shrink-0 pb-1 text-center">
          <StuckShiftDevResetButton
            role="parent"
            variant="link"
            onReset={() => void handleParentEmergencyReset()}
          />
        </div>
      ) : null}
    </main>
  );
}
