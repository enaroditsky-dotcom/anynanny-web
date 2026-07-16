"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Calendar, History, LogOut, Search, Wallet, Zap } from "lucide-react";
import { ParentSessionClosurePanel } from "@/components/session/parent-session-closure-panel";
import SessionFinalizer from "@/components/SessionFinalizer";
import { resetStuckShiftsForParent } from "@/lib/bookings/parent-reset-stuck-shifts";
import { ActionToast } from "@/components/ui/action-toast";
import { useAuth } from "@/components/auth-provider";
import { DashboardWelcomeHeader } from "@/components/dashboard/dashboard-welcome-header";
import {
  DoubleShakeCircleButton,
  DoubleShakeCircleSlot,
  DoubleShakeShiftPanel
} from "@/components/session/double-shake-circle-button";
import { ParentDoubleShakeIdleCircle, ParentSessionTimerCircle } from "@/components/session/parent-double-shake-idle-circle";
import { ParentBookingResponseModal } from "@/components/parent/parent-booking-response-modal";
import {
  acknowledgeParentBookingResponse,
  fetchUnacknowledgedParentBookingResponses,
  type ParentBookingResponseNotification
} from "@/lib/bookings/parent-booking-response-notifications";
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
import { BOOKING_SELECT_MINIMAL } from "@/lib/bookings/booking-status-update";
import { bookingLiveSyncKey } from "@/lib/bookings/booking-live-key";
import { BOOKINGS_TABLE, type BookingRow, type BookingStatus } from "@/lib/bookings/constants";
import { useTodaysLinkedBooking, type TodaysLinkedBookingSyncPayload } from "@/lib/bookings/use-todays-linked-booking";
import {
  type TodaysLinkedBookingView
} from "@/lib/bookings/todays-linked-booking";
import { normalizeBookingStatus } from "@/lib/bookings/use-shift-activation-status";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

import {
  SESSIONS_TABLE,
  SESSION_STATUS_CANCELLED,
  SESSION_PENDING_START_STATUSES,
  type SessionProtocolState,
  type SupabaseSessionRow,
  formatElapsed,
  mapSupabaseRowToProtocol,
  persistSessionState,
  readSessionState
} from "@/lib/session/protocol";
import {
  activateParentConfirmedSession,
  fetchSessionForBooking,
  insertSessionReturningRow,
  LIVE_BOOKING_STATUSES_FOR_SESSION_UI,
  readSessionLinkedBookingId,
  SESSIONS_PROTOCOL_SELECT_MINIMAL,
  updateSessionReturningRow
} from "@/lib/session/sessions-query";
import { friendlySupabaseSessionError } from "@/lib/session/supabase-errors";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";
import { safeSupabaseRead } from "@/lib/supabase/safe-supabase-read";
import { completedSummaryFromEndedState } from "@/lib/session/completed-summary";
import { submitSessionRating } from "@/lib/ratings/submit-session-rating";
import type { PublicSitterReview } from "@/lib/sitter/sitter-profile";
import { fetchSitterPublicReviews } from "@/lib/sitter/fetch-parent-sitter-profile";
import { useDashboardGreetingName } from "@/lib/user/use-dashboard-greeting-name";
import { useSession } from "@/context/SessionContext";
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
import { clearDeviceAuthHints } from "@/lib/auth/returning-user";
import {
  cacheParentDisplayId,
  fetchProfileSerialId,
  formatParentPublicIdFromSerial
} from "@/lib/public/sequential-display-id";

// 🔥 שינוי 1: ייבוא רשימת הערים האחידה מהקונפיג שייצרנו
import { SUPPORTED_CITIES } from "@/lib/bookings/cities-config";

const HOURLY_RATE = 50; 

function computeLiveElapsedSecondsActive(params: { startMs: number; parentEndRequestedAtMs: number | null; nowMs: number }): number {
  if (!params.startMs) return 0;
  const end = params.parentEndRequestedAtMs ? params.parentEndRequestedAtMs : params.nowMs;
  return Math.max(0, Math.floor((end - params.startMs) / 1000));
}

const BOOKING_SHIFT_REJECTED_NOTICE = "הבקשה נדחתה על ידי המטפלת";
const BOOKING_SHIFT_PENDING_NOTICE = "בקשה נשלחה וממתינה לאישור";
const BOOKING_SHIFT_APPROVED_NOTICE = "הבקשה אושרה";
const BOOKING_SHIFT_APPROVED_TOAST = "הבייביסיטר אישרה את בקשת המשמרת!";

type ClosureBookingVerifyState = "idle" | "checking" | "ready" | "unavailable";

type ParentDashboardCenterView =
  | "loading"
  | "matching"
  | "in_progress"
  | "confirm_end"
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

const PARENT_REVIEW_SESSION_DB_STATUSES = new Set([
  "sitter_completed",
  "completed_pending_review",
  "payment_pending",
  "paid"
]);

const PARENT_SESSION_IDLE_DB_STATUS = "completed";

const PARENT_CLOSURE_FETCH_DB_STATUSES: readonly string[] = [
  ...PARENT_REVIEW_SESSION_DB_STATUSES,
  PARENT_SESSION_IDLE_DB_STATUS
];

function isParentReviewSessionDbStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return PARENT_REVIEW_SESSION_DB_STATUSES.has(status.toLowerCase());
}

function isParentSessionIdleDbStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return status.toLowerCase() === PARENT_SESSION_IDLE_DB_STATUS;
}

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

  const dbStatus = params.sessionDbStatus?.toLowerCase() ?? "";
  if (isParentSessionIdleDbStatus(dbStatus)) return false;
  if (isParentReviewSessionDbStatus(dbStatus)) return true;

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

  if (params.bookingStatus === "completed" && params.sessionProtocolStatus === "ended") return true;
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

  if (params.bookingStatus === "approved" || params.bookingStatus === "sitter_started") {
    return "shift";
  }

  const dbStatus = params.sessionDbStatus?.toLowerCase() ?? "";
  if (dbStatus === "sitter_completed" || params.bookingStatus === "sitter_ended") {
    return "confirm_end";
  }

  if (isParentSessionIdleDbStatus(dbStatus)) return "idle";
  if (
    dbStatus === "payment_pending" ||
    dbStatus === "paid" ||
    dbStatus === "completed_pending_review"
  ) {
    return "review_pay";
  }

  if (params.bookingStatus === "pending" || dbStatus === "matching") {
    return "matching";
  }

  const reviewAllowed = isParentReviewPaySessionAllowed(params);
  if (reviewAllowed && (params.sessionClosureEligible || params.sessionProtocolStatus === "ended")) {
    return "review_pay";
  }

  const inProgress =
    dbStatus !== "sitter_completed" &&
    String(params.bookingStatus ?? "") !== "sitter_ended" &&
    (params.sessionProtocolStatus === "active" ||
      params.sessionProtocolStatus === "parent_initiated" ||
      isLiveSessionDbStatus(params.sessionDbStatus) ||
      (params.bookingStatus != null &&
        LIVE_BOOKING_STATUSES_FOR_SESSION_UI.has(params.bookingStatus)));

  if (inProgress) return "in_progress";

  if (
    params.bookingStatus &&
    !isBookingTerminalStatus(params.bookingStatus) &&
    String(params.bookingStatus) !== "pending"
  ) {
    return "shift";
  }

  return "idle";
}

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

export default function ParentDashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { isLoading: authLoading } = useAuth();
  const { nowMs, setNowMs, parent: sessionParent } = useSession();

  const {
    userId: parentUserId,
    setUserId: setParentUserId,
    sessionState,
    setSessionState,
    sessionDbStatus,
    setSessionDbStatus,
    parentSessionView,
    setParentSessionView,
    sessionHydrateError,
    setSessionHydrateError,
    shiftUiLocked,
    setShiftUiLocked,
    bookingShiftRejectedNotice,
    setBookingShiftRejectedNotice,
    clientHasSessionUser,
    setClientHasSessionUser,
    bootstrapComplete: parentBootstrapComplete,
    setBootstrapComplete: setParentBootstrapComplete,
    sessionHydrateComplete,
    setSessionHydrateComplete,
    bookingCache: parentBookingCache,
    patchBookingCache: patchParentBookingCache,
    circleBooking,
    bookingRef,
    applyCircleBooking,
    syncFromPayload,
    syncFromLinkedBooking,
    shiftCompletedFrozenRef
  } = sessionParent;

  const [useSupabase, setUseSupabase] = useState(false);
  const [dbBanner, setDbBanner] = useState<string | null>(null);
  const [debugToast, setDebugToast] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [closureError, setClosureError] = useState<string | null>(null);
  const [closureBookingVerify, setClosureBookingVerify] = useState<ClosureBookingVerifyState>("idle");
  const [bookingPaymentStatus, setBookingPaymentStatus] = useState<"unknown" | "paid" | "unpaid">("unknown");
  const [payBusy, setPayBusy] = useState(false);
  const [closureSitterReviews, setClosureSitterReviews] = useState<PublicSitterReview[]>([]);
  const [shiftFinishedLocked, setShiftFinishedLocked] = useState(false);
  const [confirmEndBusy, setConfirmEndBusy] = useState(false);
  const [stripeCheckoutNonce, setStripeCheckoutNonce] = useState(0);
  const [checkoutFinalizeSessionId, setCheckoutFinalizeSessionId] = useState<string | null>(null);
  const [bookingFeedbackToast, setBookingFeedbackToast] = useState<string | null>(null);
  const [bookingFeedbackVariant, setBookingFeedbackVariant] = useState<"success" | "error" | "info">("info");
  const [startShiftBusy, setStartShiftBusy] = useState(false);
  
  const [nowBusy, setNowBusy] = useState(false);
  const [showCityModal, setShowCityModal] = useState(false);
  const [selectedCity, setSelectedCity] = useState("חיפה");

  const [bookingResponseNotifications, setBookingResponseNotifications] = useState<
    ParentBookingResponseNotification[]
  >([]);
  const [activeBookingResponseNotification, setActiveBookingResponseNotification] =
    useState<ParentBookingResponseNotification | null>(null);
  const [bookingResponseAckBusy, setBookingResponseAckBusy] = useState(false);

  const [realParentDisplayId, setRealParentDisplayId] = useState<string | null>(null);
  const [isOnboardingDone, setIsOnboardingDone] = useState(true);

  const { firstName, nameLoading: greetingNameLoading } = useDashboardGreetingName(
    "parent",
    parentUserId
  );

  const lockShiftUi = useCallback((bookingId?: string) => {
    if (bookingId?.trim()) {
      persistShiftLocallyDismissed(bookingId);
    }
    setShiftUiLocked(true);
  }, [setShiftUiLocked]);

  const prevShiftGateStatusRef = useRef<string | null>(null);
  const parentDashboardCenterViewRef = useRef<ParentDashboardCenterView>("loading");

  const handleLogout = async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    clearDeviceAuthHints();
    router.replace("/");
    router.refresh();
  };

  const breakCompletedRealtimeLoop = useCallback(
    (source: "sync" | "realtime") => {
      if (parentDashboardCenterViewRef.current === "review_pay") return;
      if (shiftCompletedFrozenRef.current) return;
      shiftCompletedFrozenRef.current = true;
      applyCircleBooking(null);
    },
    [applyCircleBooking, shiftCompletedFrozenRef]
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
  }, [setBookingShiftRejectedNotice]);

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
    [applyBookingShiftNotice, applyCircleBooking, setBookingFeedbackVariant, setBookingFeedbackToast]
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
      applyBookingShiftNotice,
      applyCircleBooking,
      bookingRef,
      shiftCompletedFrozenRef
    ]
  );

  const {
    booking: todaysBookingHook,
    shiftGate: todayBookingShiftGateHook,
    ready: bookingGuardReadyHook,
    reload: reloadTodaysBooking
  } = useTodaysLinkedBooking("parent", parentUserId, {
    onBookingSync: handleBookingLiveSync
  });

  useEffect(() => {
    patchParentBookingCache({
      booking: todaysBookingHook,
      shiftGate: todayBookingShiftGateHook,
      ready: bookingGuardReadyHook
    });
  }, [
    todaysBookingHook,
    todayBookingShiftGateHook,
    bookingGuardReadyHook,
    patchParentBookingCache
  ]);

  const bookingGuardReady = bookingGuardReadyHook || parentBookingCache.ready;
  const todaysBooking = todaysBookingHook ?? parentBookingCache.booking;
  const todayBookingShiftGate = todayBookingShiftGateHook ?? parentBookingCache.shiftGate;

  const sessionStatus = sessionState?.status || "idle";
  const sessionLinkedBookingId = sessionState?.linkedBookingId ?? "";
  const sessionSupabaseSessionId = sessionState?.supabaseSessionId ?? "";

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
  }, [todaysBookingId, setShiftUiLocked]);

  useEffect(() => {
    if (todaysBookingStatus === "completed") {
      breakCompletedRealtimeLoop("sync");
      return;
    }
    if (bookingGuardReady && todaysBookingId && !isShiftLocallyDismissed(todaysBookingId)) {
      setShiftUiLocked(false);
    }
  }, [todaysBookingStatus, todaysBookingId, bookingGuardReady, breakCompletedRealtimeLoop, setShiftUiLocked]);

  const syncFromStorage = useCallback(() => {
    try {
      setSessionState(readSessionState());
    } catch {
      setSessionState({ status: "idle" });
    }
  }, [setSessionState]);

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
    void (async () => {
      const read = safeSupabaseRead(
        await supabase
          .from(BOOKINGS_TABLE)
          .select(BOOKING_SELECT_MINIMAL)
          .eq("id", bookingId)
          .maybeSingle(),
        "parent hydrate linked booking"
      );

      if (!cancelled && read.data) {
        const prev = bookingRef.current ?? todaysBookingRef.current;
        applyCircleBooking(bookingRowToCircleView(read.data as BookingRow, prev, "parent"));
      }
    })().catch((error) => {
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
    if (sessionStatus === "parent_initiated") {
      return 0;
    }
    
    const startedAt = sessionState?.parentStartedAtMs;
    if (!startedAt) return 0;
    
    if (sessionStatus === "active") {
      return computeLiveElapsedSecondsActive({
        startMs: startedAt,
        parentEndRequestedAtMs: sessionState?.parentEndRequestedAtMs ?? null,
        nowMs
      });
    }
    
    return sessionState?.finalElapsedSeconds ?? 0;
  }, [nowMs, sessionStatus, sessionState?.parentStartedAtMs, sessionState?.parentEndRequestedAtMs, sessionState?.finalElapsedSeconds]);

  const timerText = useMemo(() => formatElapsed(elapsedSeconds), [elapsedSeconds]);
  
  const earnedNis = useMemo(() => ((elapsedSeconds / 3600) * HOURLY_RATE).toFixed(2), [elapsedSeconds]);
  const completedSummary = useMemo(
    () => completedSummaryFromEndedState(sessionState || { status: "idle" }, HOURLY_RATE),
    [sessionState]
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
        sessionState: sessionState || { status: "idle" },
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
        sessionProtocolStatus: sessionStatus,
        sessionClosureEligible,
      }),
    [
      bookingGuardReady,
      sessionHydrateError,
      todaysBookingStatusNormalized,
      sessionDbStatus,
      sessionStatus,
      sessionClosureEligible
    ]
  );

  parentDashboardCenterViewRef.current = parentDashboardCenterView;

  const isNewBookingPendingStart = todaysBookingStatusNormalized === "approved";

  const showParentSessionClosure = parentDashboardCenterView === "review_pay" && !isNewBookingPendingStart;
  const parentSessionInProgress = parentDashboardCenterView === "in_progress";
  const showParentConfirmEnd = parentDashboardCenterView === "confirm_end" && !isNewBookingPendingStart;

  const effectiveClosureSummary = useMemo(() => {
    if (!showParentSessionClosure) return completedSummary;
    if (completedSummary) return completedSummary;
    const endMs = sessionState?.endedAtMs ?? Date.now();
    const startMs = sessionState?.parentStartedAtMs ?? endMs;
    const finalSeconds =
      sessionState?.finalElapsedSeconds ??
      Math.max(0, Math.floor((endMs - startMs) / 1000));
    const amountNis =
      sessionState?.finalAmountNis ??
      Number(((finalSeconds / 3600) * HOURLY_RATE).toFixed(2));
    return { elapsedSeconds: finalSeconds, amountNis };
  }, [completedSummary, showParentSessionClosure, sessionState]);

  const buildParentSessionFinishedState = useCallback(
    (prev: SessionProtocolState, row?: SupabaseSessionRow | null): SessionProtocolState => {
      const endMs = row?.end_time ? new Date(row.end_time).getTime() : Date.now();
      const startMs =
        prev?.parentStartedAtMs ??
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
          prev?.linkedBookingId ??
          readSessionLinkedBookingId(row ?? null, todaysBookingId) ??
          (todaysBookingId || undefined),
        supabaseSessionId:
          prev?.supabaseSessionId ?? (row?.id != null ? String(row.id) : undefined)
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
          const reviews = await fetchSitterPublicReviews(supabase, sitterId, 3);
          if (cancelled) return;
          setClosureSitterReviews(reviews);
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
    if (!bookingGuardReady) return;
    const db = sessionDbStatus?.toLowerCase() ?? "";
    if (db === "sitter_completed" || isParentReviewSessionDbStatus(db)) {
      setParentSessionView("review_pay");
      setShiftFinishedLocked(true);
      return;
    }
    if (isParentSessionIdleDbStatus(db)) {
      const idle: SessionProtocolState = { status: "idle" };
      const status = normalizeBookingStatus(todaysBooking?.status);
      if (status !== "completed") {
        persistSessionState(idle);
        setSessionState(idle);
      }
      setParentSessionView("idle");
      setSessionDbStatus(null);
      setShiftFinishedLocked(false);
      setShiftUiLocked(false);
      shiftCompletedFrozenRef.current = false;
      return;
    }
    if (parentSessionView === "review_pay") {
      setParentSessionView("idle");
      setShiftFinishedLocked(false);
    }
  }, [
    bookingGuardReady,
    sessionDbStatus,
    parentSessionView,
    setParentSessionView,
    setSessionDbStatus,
    setShiftFinishedLocked,
    setShiftUiLocked,
    setSessionState,
    shiftCompletedFrozenRef,
    todaysBooking?.status
  ]);

  // 🔥 שינוי 2: שדרוג מנגנון ה-Bypass למעקף חברת הסליקה בתקופת ה-Beta
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

      const amountNis = completedSummary?.amountNis ?? sessionState?.finalAmountNis ?? 0;
      const amountMinorUnits = Math.max(50, Math.round(Number(amountNis) * 100));
      
      try {
        // קריאה ישירה ל-Endpoint של המעקף (Mock Bypass)
        const response = await fetch("/api/hyp/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingId: bid,
            amountMinorUnits,
            currency: "ils",
            description: "תשלום משמרת AnyNanny - סימולציית Beta"
          }),
        });

        const data = await response.json();
        if (data.url) {
          // דוחף את הדפדפן להפניה חזרה המקומית כדי לסגור מעגל Realtime מול הנני
          window.location.assign(data.url);
        } else {
          setClosureError(data.error || "שגיאה בביצוע מעקף תשלום");
          setPayBusy(false);
        }
      } catch (e) {
        console.error("[parent] Beta simulation checkout:", e);
        setClosureError("שגיאה ברשת בבקשת מעקף תשלום.");
        setPayBusy(false);
      }
    },
    [
      sessionSupabaseSessionId,
      closureBookingId,
      closureBookingVerify,
      sessionState?.finalAmountNis,
      completedSummary
    ]
  );

  const handleAnyNannyNowClick = () => {
    if (sessionStatus !== "idle") {
      setDebugToast("יש לסיים את המשמרת הנוכחית תחילה.");
      return;
    }
    setShowCityModal(true);
  };

  const handleLaunchBroadcast = async () => {
    if (nowBusy || !parentUserId) return;
    
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      alert("Supabase לא מוגדר בדשבורד.");
      return;
    }

    setNowBusy(true);
    try {
      const { data, error } = await supabase
        .from("broadcast_alerts")
        .insert([
          {
            parent_id: parentUserId,
            city: selectedCity, 
            service_type: "sitter",
            status: "pending"
          }
        ])
        .select("id")
        .maybeSingle();

      if (error || !data) throw error || new Error("לא התקבל מזהה שידור.");

      setShowCityModal(false);
      router.push(`/parent/search/broadcast-radar?alertId=${data.id}&city=${selectedCity}&type=sitter`);

    } catch (err) {
      console.error("❌ Error launching AnyNanny NOW:", err);
      alert("תקלה בהפעלת קריאה מיידית. נסו שוב.");
    } finally {
      setNowBusy(false);
    }
  };

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
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("checkout") === "success") {
       setParentSessionView("idle");
    }
    setSessionDbStatus(null);
    setClosureSitterReviews([]);
    setClosureError(null);
    setNowMs(Date.now());
  }, [sessionSupabaseSessionId, sessionLinkedBookingId, todaysBookingId, lockShiftUi, setSessionDbStatus, setSessionState, setParentSessionView, setNowMs]);

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
  }, [bookingSyncKey, syncFromLinkedBooking, breakCompletedRealtimeLoop, todaysBookingStatus, todaysBookingId, shiftUiLocked, sessionStatus, shiftCompletedFrozenRef, todaysBookingRef]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("checkout") !== "success") return;
    const fromUrl = sp.get("session_id") ?? sp.get("sessionId");
    let fromStore: string | null = null;
    try {
      fromStore = readSessionState().supabaseSessionId ?? null;
    } catch {
      fromStore = null;
    }
    const id = (fromUrl ?? fromStore)?.trim();
    if (id) {
      setCheckoutFinalizeSessionId(id);
    }
  }, []);

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

  useEffect(() => {
    applyBookingShiftNotice(shiftGateStatus || undefined);
  }, [shiftGateStatus, applyBookingShiftNotice]);

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

      if (rowStatus === "sitter_ended") {
        void reloadTodaysBooking();
        setNowMs(Date.now());
        return;
      }

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

    const channel = subscribePostgresChanges(supabase, `parent-dashboard-bookings-${parentUserId}`, {
      event: "*",
      table: BOOKINGS_TABLE,
      filter: `parent_id=eq.${parentUserId}`,
      handler: handleRowChange
    });

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [
    parentUserId,
    todaysBookingStatus,
    reloadTodaysBooking,
    notifyBookingTransition,
    breakCompletedRealtimeLoop,
    applyCircleBooking,
    applyParentTrackingCircleFromRow,
    shiftCompletedFrozenRef,
    setNowMs,
    todaysBookingStatusRef
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

  useEffect(() => {
    if (!bookingGuardReady) return;

    const liveStatuses = new Set<BookingStatus>([
      "pending",
      "approved",
      "sitter_started",
      "parent_started",
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
          sessionHydrateError: false,
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
      sessionState?.parentStartedAtMs
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
    sessionState?.parentStartedAtMs,
    sessionHydrateError,
    sessionDbStatus,
    setSessionState,
    setSessionDbStatus,
    setParentSessionView,
    setNowMs
  ]);

  useEffect(() => {
    if (!sessionUiBlockedByBooking) return;
    if (sessionStatus === "idle" || sessionStatus === "ended") return;
    const idle: SessionProtocolState = { status: "idle" };
    persistSessionState(idle);
    setSessionState(idle);
    setNowMs(Date.now());
  }, [sessionUiBlockedByBooking, sessionStatus, setSessionState, setNowMs]);

  useEffect(() => {
    if (parentBootstrapComplete && clientHasSessionUser === true) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setClientHasSessionUser(false);
      setParentBootstrapComplete(true);
      return;
    }
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setClientHasSessionUser(!!data.session?.user);
      } catch (e) {
        console.warn("[parent] auth getSession failed:", e);
      } finally { 
        setParentBootstrapComplete(true);
      }
    })();
  }, [parentBootstrapComplete, clientHasSessionUser, setClientHasSessionUser, setParentBootstrapComplete]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

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

          const { data: onboardingProfile } = await supabase
            .from("profiles")
            .select("parent_onboarding_completed_at")
            .eq("id", userId)
            .maybeSingle();
          if (!cancelled) {
            setIsOnboardingDone(!!onboardingProfile?.parent_onboarding_completed_at);
          }

          const { serialId, role, error: profileErr } = await fetchProfileSerialId(supabase, userId);
          if (profileErr) {
            console.warn("[parent] profile serial load:", profileErr);
          }

          if (!cancelled && role === "parent") {
            const displayId = formatParentPublicIdFromSerial(serialId);
            if (displayId) {
              setRealParentDisplayId(displayId);
              cacheParentDisplayId(displayId);
            }
          }

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
      window.removeEventListener("storage", onStorage);
    };
  }, [syncFromStorage, setParentUserId]);

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
        if (!sessionHydrateComplete) {
          setSessionHydrateError(false);
        }
        let local: SessionProtocolState = sessionState || { status: "idle" };
        try {
          local = reconcileStaleEndedLocalState(
            readSessionState(),
            normalizeBookingStatus(todaysBooking?.status)
          );
        } catch {
          /* ignore */
        }

        if (todaysBookingStatus === "completed") {
          if (isShiftLocallyDismissed(todaysBookingId)) {
            const idle: SessionProtocolState = { status: "idle" };
            persistSessionState(idle);
            if (!cancelled) setSessionState(idle);
            return;
          }
          setShiftUiLocked(true);

          const dismissedId = readDismissedCompletedSessionId("parent");
          let row = await fetchRelevantParentSessionRow(
            supabase,
            parentUserId,
            todaysBookingId,
            "completed"
          );
          if (!row) {
            const { row: terminalRow } = await fetchSessionForBooking(supabase, {
              parentId: parentUserId,
              bookingId: todaysBookingId,
              statuses: [...PARENT_CLOSURE_FETCH_DB_STATUSES],
              orderBy: "end_time",
              ascending: false
            });
            row = terminalRow;
          }
          if (cancelled) return;

          if (row) {
            const rowDbStatus = String(row.status);
            if (isParentSessionIdleDbStatus(rowDbStatus)) {
              const idle: SessionProtocolState = { status: "idle" };
              persistSessionState(idle);
              if (!cancelled && local.status !== "idle") {
                setSessionState(idle);
              }
              return;
            }
            setSessionDbStatus(rowDbStatus);
            if (isParentReviewSessionDbStatus(rowDbStatus)) {
              const finished = buildParentSessionFinishedState(local, row);
              persistSessionState(finished);
              if (!cancelled && local.status !== "ended") {
                setSessionState(finished);
                setParentSessionView("review_pay");
                setShiftFinishedLocked(true);
              }
              return;
            }
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
          if (local.status === "ended") {
            if (!cancelled) {
              setSessionState(local);
              setShiftUiLocked(true);
            }
            return;
          }
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
          if (!cancelled && sessionState.status !== "idle") {
            setSessionState(idle);
          }
          return;
        }

        if (local.status === "active" && local.parentStartedAtMs) {
          if (!cancelled && sessionState.status !== "active") {
            setSessionState(local);
          }
        }

        let row = await fetchRelevantParentSessionRow(
          supabase,
          parentUserId,
          todaysBookingId,
          todaysBookingStatusNormalized
        );
        if (!row) {
          const { row: terminalRow } = await fetchSessionForBooking(supabase, {
            parentId: parentUserId,
            bookingId: todaysBookingId,
            statuses: [...PARENT_CLOSURE_FETCH_DB_STATUSES],
            orderBy: "end_time",
            ascending: false
          });
          row = terminalRow;
        }

        if (cancelled) return;

        if (row) {
          const dismissedId = readDismissedCompletedSessionId("parent");
          const rowDbStatus = String(row.status);
          if (isParentSessionIdleDbStatus(rowDbStatus)) {
            if (sessionState.status === "idle") {
              return;
            }
          
            const idle: SessionProtocolState = { status: "idle" };
            persistSessionState(idle);
            
            if (!cancelled) {
              setSessionState(idle);
              setParentSessionView("idle");
              setSessionDbStatus(null);
              setShiftFinishedLocked(false);
            }
            return;
          }
        
          if (sessionState.status !== "idle") {
            setSessionDbStatus(rowDbStatus);
          }
          if (isParentReviewSessionDbStatus(rowDbStatus)) {
            const finished = buildParentSessionFinishedState(local, row);
            persistSessionState(finished);
            if (!cancelled && sessionState.status !== "ended") {
              setSessionState(finished);
              setParentSessionView("review_pay");
              setShiftFinishedLocked(true);
            }
            return;
          }
          const merged = mergeParentSessionFromDbRow(row, {
            dismissedCompletedSessionId: dismissedId,
            todaysBookingId,
            localState: local, // החזרת משתנה הלוקאל התקין
            bookingStatus: todaysBookingStatusNormalized
          });
          if (merged) {
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
          } else {
            const rowDbStatus = String(row.status);
            setSessionDbStatus(rowDbStatus);
            if (isParentReviewSessionDbStatus(rowDbStatus)) {
              const finished = buildParentSessionFinishedState(local, row);
              persistSessionState(finished);
              if (!cancelled && sessionState.status !== "ended") {
                setSessionState(finished);
                setParentSessionView("review_pay");
                setShiftFinishedLocked(true);
              }
            }
          }
        } else if (local.status === "active" || local.status === "parent_initiated") {
          const idle: SessionProtocolState = { status: "idle" };
          persistSessionState(idle);
          if (!cancelled) setSessionState(idle);
        }
      } catch (e) {
        console.warn("[parent] session hydrate error:", e);
        setSessionHydrateError(true);
      } finally { 
        if (!cancelled) setSessionHydrateComplete(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    parentUserId,
    bookingGuardReady,
    todaysBookingId,
    todaysBookingStatus,
    shiftUiLocked,
    lockShiftUi,
    setSessionHydrateComplete,
    todaysBookingStatusNormalized,
    buildParentSessionFinishedState,
    sessionState,
    sessionHydrateComplete,
    setSessionHydrateError,
    setSessionState,
    setParentSessionView,
    setSessionDbStatus,
    setShiftFinishedLocked,
    shiftCompletedFrozenRef
  ]);

  useEffect(() => {
    if (
      (shiftUiLocked && sessionStatus !== "ended" && !sessionSupabaseSessionId) ||
      isShiftLocallyDismissed(todaysBookingId) ||
      ((shiftCompletedFrozenRef.current || todaysBookingStatus === "completed") &&
        sessionStatus !== "ended" &&
        !sessionSupabaseSessionId)
    ) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase || !parentUserId) return;

    const sid = sessionSupabaseSessionId;
    const filter = sid ? `id=eq.${sid}` : `parent_id=eq.${parentUserId}`;
    const handler = (payload: {
      new?: Record<string, unknown>;
      old?: Record<string, unknown>;
    }) => {
      try {
        const rowData = (payload.new ?? payload.old) as SupabaseSessionRow | undefined;
        if (!rowData || typeof rowData !== "object") return;
        const row = rowData as SupabaseSessionRow;

        const rowDbStatus = String(row.status ?? "");
        const incomingStatus = rowDbStatus.toLowerCase();
        
        if (isParentSessionIdleDbStatus(rowDbStatus)) {
          const idle: SessionProtocolState = { status: "idle" };
          persistSessionState(idle);
          setSessionState(idle);
          setSessionDbStatus(null);
          setParentSessionView("idle");
          setShiftFinishedLocked(false);
          setShiftUiLocked(false);
          shiftCompletedFrozenRef.current = false;
          setNowMs(Date.now());
          return;
        }

        if (incomingStatus === "sitter_completed") {
          setSessionDbStatus(rowDbStatus);
          setParentSessionView("review_pay");
          setSessionState((prev) => {
            const next = buildParentSessionFinishedState(prev, row);
            persistSessionState(next);
            return next;
          });
          setShiftFinishedLocked(true);
          setShiftUiLocked(true);
          void reloadTodaysBooking();
          setNowMs(Date.now());
          return;
        }

        if (
          isParentReviewSessionDbStatus(rowDbStatus) ||
          incomingStatus === "payment_pending" ||
          incomingStatus === "paid"
        ) {
          setSessionDbStatus(rowDbStatus);
          setParentSessionView("review_pay");
          setSessionState((prev) => {
            if (prev?.status === "ended") return prev;
            const next = buildParentSessionFinishedState(prev, row);
            persistSessionState(next);
            return next;
          });
          setShiftFinishedLocked(true);
          setShiftUiLocked(true);
          setNowMs(Date.now());
          return;
        }

        const dismissedId = readDismissedCompletedSessionId("parent");
        setSessionDbStatus(rowDbStatus);
        setSessionState((prev) => {
          if (prev?.status === "ended") {
            return prev;
          }
          const merged = mergeParentSessionFromDbRow(row, {
            dismissedCompletedSessionId: dismissedId,
            todaysBookingId,
            localState: prev || { status: "idle" },
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
    const channel = subscribePostgresChanges(
      supabase,
      `parent-session-rt-${parentUserId}-${sid ?? "none"}`,
      {
        event: "*",
        table: SESSIONS_TABLE,
        filter,
        handler
      }
    );
    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [
    parentUserId,
    sessionSupabaseSessionId,
    todaysBookingStatus,
    todaysBookingId,
    shiftUiLocked,
    todaysBookingStatusNormalized,
    buildParentSessionFinishedState,
    bookingGuardReady,
    sessionHydrateError,
    sessionStatus,
    reloadTodaysBooking,
    setSessionDbStatus,
    setParentSessionView,
    setSessionState,
    setShiftFinishedLocked,
    setShiftUiLocked,
    shiftCompletedFrozenRef,
    setNowMs
  ]);

  const handleConfirmShiftStartClick = () => {
    void startSession();
  };

  const cancelSession = async () => {
    if (sessionStatus !== "parent_initiated" || !sessionSupabaseSessionId) return;

    const auth = await resolveBrowserAuth();
    if (!auth.ok) {
      setDbBanner(auth.reason === "no_client" ? "Supabase לא מוגדר." : "יש להתחבר כדי לביטל את הבקשה.");
      return;
    }

    setCancelBusy(true);
    setDbBanner(null);
    try {
      const { error } = await auth.supabase
        .from(SESSIONS_TABLE)
        .update({ status: SESSION_STATUS_CANCELLED })
        .eq("id", sessionSupabaseSessionId)
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

  const startSession = async () => {
    if (startShiftBusy) return;
    if (sessionStatus === "parent_initiated" || sessionStatus === "active") return;

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
      setDbBanner("לא ניתן לפתוח משמרת — הבקשה בבוטלה או נדחתה.");
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

      const { data: existingSession } = await auth.supabase
        .from(SESSIONS_TABLE)
        .select(SESSIONS_PROTOCOL_SELECT_MINIMAL)
        .eq("parent_id", auth.userId)
        .eq("sitter_id", linkedSitterId)
        .in("status", ["pending", "active"])
        .maybeSingle();

      if (existingSession) {
        row = existingSession as SupabaseSessionRow;
      } else if (isArrivalConfirm) {
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
    } finally { // 🔥 תיקון איות: מ-finaly ל-finally התקני בשורה 2057
      setStartShiftBusy(false);
    }
  };

  const handleParentConfirmEndShift = useCallback(async () => {
    const sessionId = sessionSupabaseSessionId;
    if (!sessionId || confirmEndBusy) return;
    setConfirmEndBusy(true);
    setDbBanner(null);
    try {
      const auth = await resolveBrowserAuth();
      if (!auth.ok) {
        setDbBanner(
          auth.reason === "no_client"
            ? "Supabase לא מוגדר."
            : "יש להתחבר כדי לאשר סיום משמרת."
        );
        return;
      }

      const { error } = await auth.supabase.rpc("end_shift_atomic", {
        p_session_id: sessionId,
        p_parent_id: auth.userId,
        p_end_iso: new Date().toISOString(),
        p_elapsed: elapsedSeconds,
        p_amount: Number(earnedNis)
      });

      if (error) {
        console.error("[parent] confirm end shift failed:", error);
        setDbBanner(friendlySupabaseSessionError({ message: error.message }));
        return;
      }

      setSessionState((prev) => buildParentSessionFinishedState(prev, null));
      setSessionDbStatus("payment_pending");
      setParentSessionView("review_pay");
      await reloadTodaysBooking();
    } catch (e) {
      console.error("[parent] confirm end shift:", e);
      setDbBanner(friendlySupabaseSessionError(e));
    } finally {
      setConfirmEndBusy(false);
    }
  }, [
    sessionSupabaseSessionId,
    confirmEndBusy,
    elapsedSeconds,
    earnedNis,
    buildParentSessionFinishedState,
    setSessionState,
    setSessionDbStatus,
    setParentSessionView,
    reloadTodaysBooking
  ]);

  const waitingNannyStart = sessionStatus === "parent_initiated";
  const waitingNannyEnd =
    sessionStatus === "active" && sessionState?.parentEndRequestedAtMs != null;

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
      (sessionStatus !== "ended" || parentShiftStatus === "approved" || parentShiftStatus === "sitter_started") &&
      isParentShiftBookingActionable(idleCircleBooking, parentShiftStatus ?? "", nowMs),
    [
      showParentSessionClosure,
      parentSessionInProgress,
      sessionStatus,
      idleCircleBooking,
      parentShiftStatus,
      nowMs
    ]
  );

  useEffect(() => {
    if (!bookingGuardReady || showParentSessionClosure) return;
    if (sessionStatus !== "idle") return;

    const booking = idleCircleBooking;
    if (!booking) return;

    const status = normalizeBookingStatus(booking.status);
    if (!status || status === "pending") return;
    if (isParentShiftBookingActionable(booking, status, nowMs)) return;

    applyCircleBooking(null);
  }, [
    bookingGuardReady,
    showParentSessionClosure,
    sessionStatus,
    idleCircleBooking,
    nowMs,
    applyCircleBooking
  ]);

  const showParentPendingNotice = isParentPendingLocked;

  const shiftStartTimeForVisibility =
    idleCircleBooking?.start_time ?? todaysBooking?.start_time ?? "";

  const isWithin10Minutes = shiftStartTimeForVisibility
    ? new Date(shiftStartTimeForVisibility).getTime() - Date.now() <= 10 * 60 * 1000
    : false;

  const isShiftCurrentlyActive =
    parentSessionInProgress ||
    waitingNannyStart ||
    waitingNannyEnd ||
    showParentSessionClosure ||
    showParentConfirmEnd ||
    parentShiftStatus === "parent_started" ||
    parentShiftStatus === "sitter_started" ||
    parentShiftStatus === "sitter_ended";

  const showParentApprovedNotice =
    !bookingShiftRejectedNotice &&
    !showParentPendingNotice &&
    isParentApprovedShift &&
    hasActionableShiftBooking &&
    isWithin10Minutes;

  const sessionRunning =
    !sessionUiBlockedByBooking &&
    !showParentSessionClosure &&
    sessionStatus !== "ended" &&
    (sessionStatus === "active" || sessionStatus === "parent_initiated");

  const hideSearchShortcuts =
    isParentPendingLocked ||
    sessionRunning ||
    showParentSessionClosure ||
    waitingNannyStart ||
    waitingNannyEnd ||
    bookingShiftRejectedNotice ||
    (hasActionableShiftBooking &&
      !bookingShiftRejectedNotice &&
      todaysBookingStatus !== "rejected" &&
      todaysBookingStatus !== "cancelled" &&
      (isWithin10Minutes || isShiftCurrentlyActive));

  const handleDismissRejectedNotice = useCallback(() => {
    setBookingShiftRejectedNotice(false);
    setBookingFeedbackToast(null);
  }, [setBookingShiftRejectedNotice, setBookingFeedbackToast]);

  const refreshBookingResponseNotifications = useCallback(async () => {
    if (!parentUserId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const { notifications, error } = await fetchUnacknowledgedParentBookingResponses(
      supabase,
      parentUserId
    );
    if (error) {
      console.warn("[parent] booking response notifications:", error);
    }
    setBookingResponseNotifications(notifications);
    setActiveBookingResponseNotification((current) => {
      if (current && notifications.some((n) => n.id === current.id)) {
        return current;
      }
      return notifications[0] ?? null;
    });
  }, [parentUserId]);

  const handleAcknowledgeBookingResponse = useCallback(async () => {
    const notification = activeBookingResponseNotification;
    if (!notification || !parentUserId || bookingResponseAckBusy) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setBookingResponseAckBusy(true);
    try {
      const { ok, error } = await acknowledgeParentBookingResponse(
        supabase,
        parentUserId,
        notification.id
      );
      if (!ok) {
        console.warn("[parent] acknowledge booking response:", error);
        return;
      }

      const nextNotifications = bookingResponseNotifications.filter(
        (item) => item.id !== notification.id
      );
      setBookingResponseNotifications(nextNotifications);
      setActiveBookingResponseNotification(nextNotifications[0] ?? null);
    } finally {
      setBookingResponseAckBusy(false);
    }
  }, [activeBookingResponseNotification, parentUserId, bookingResponseAckBusy, bookingResponseNotifications]);

  useEffect(() => {
    if (!parentUserId || !parentBootstrapComplete) return;
    void refreshBookingResponseNotifications();
  }, [parentUserId, parentBootstrapComplete, refreshBookingResponseNotifications]);

  useEffect(() => {
    if (!parentUserId) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = subscribePostgresChanges(
      supabase,
      `parent-dashboard-response-notifications-${parentUserId}`,
      {
        event: "UPDATE",
        table: BOOKINGS_TABLE,
        filter: `parent_id=eq.${parentUserId}`,
        handler: (payload) => {
          const row = readBookingRowFromRealtimeChange(
            payload as Parameters<typeof readBookingRowFromRealtimeChange>[0]
          );
          if (!row) return;
          const status = normalizeBookingStatus(row.status);
          if (status === "approved" || status === "rejected") {
            void refreshBookingResponseNotifications();
          }
        }
      }
    );

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [parentUserId, refreshBookingResponseNotifications]);

  const showParentShiftCircle =
    !showParentSessionClosure &&
    !parentSessionInProgress &&
    !bookingShiftRejectedNotice &&
    sessionStatus !== "active" &&
    sessionStatus !== "parent_initiated" &&
    hasActionableShiftBooking &&
    isWithin10Minutes;

  const showShiftPanel =
    showParentSessionClosure ||
    showParentConfirmEnd ||
    parentSessionInProgress ||
    sessionRunning ||
    waitingNannyStart ||
    waitingNannyEnd ||
    bookingShiftRejectedNotice ||
    showParentPendingNotice ||
    showParentApprovedNotice ||
    (hasActionableShiftBooking && (isWithin10Minutes || isShiftCurrentlyActive));

  const showParentActiveSessionCenter =
    sessionStatus === "active" &&
    !waitingNannyEnd &&
    !showParentSessionClosure &&
    !sessionUiBlockedByBooking;

  const clearParentShiftUi = useCallback(() => {
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
  }, [setSessionState, setSessionDbStatus, setParentSessionView, setNowMs, shiftCompletedFrozenRef, setShiftUiLocked, setShiftFinishedLocked, setSessionHydrateError]);

  const handleParentEmergencyReset = useCallback(async () => {
    if (
      !window.confirm(
        "לשחרר משמרת תקועה? פעולה זו תמחק sessions פתוחים ו-bookings פתוחים להיום מהמערכת."
      )
    ) {
      return;
    }

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase || !parentUserId) {
        setDebugToast("יש להתחבר כדי לשחרר משמרת.");
        return;
      }

      const result = await resetStuckShiftsForParent(supabase, parentUserId);
      clearParentShiftUi();
      await reloadTodaysBooking();

      if (result.error) {
        setDebugToast(result.error);
        return;
      }

      const parts: string[] = [];
      if (result.sessionsDeleted > 0) {
        parts.push(`${result.sessionsDeleted} sessions נמחקו`);
      }
      if (result.bookingsDeleted > 0) {
        parts.push(`${result.bookingsDeleted} bookings נמחקו`);
      }
      setDebugToast(
        parts.length > 0
          ? `שוחרר בהצלחה: ${parts.join(" · ")}`
          : "המסך שוחרר — אין משמרות פתוחות."
      );
    } catch (err) {
      console.warn("[handleParentEmergencyReset]", err);
      clearParentShiftUi();
      try {
        await reloadTodaysBooking();
      } catch (reloadErr) {
        console.warn("[handleParentEmergencyReset] reload after failure:", reloadErr);
      }
      setDebugToast(
        err instanceof Error ? err.message : "שגיאה בשחרור המשמרת. נסו לרענן את המסך."
      );
    }
  }, [parentUserId, reloadTodaysBooking, clearParentShiftUi]);

  const interstateClosure =
    showParentSessionClosure &&
    bookingPaymentStatus !== "paid" &&
    closureBookingVerify !== "unavailable";

  const showLoading =
    !parentBootstrapComplete &&
    clientHasSessionUser !== true &&
    (clientHasSessionUser === null || (clientHasSessionUser === false && authLoading));

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
      className={`mx-auto flex h-full min-h-0 w-full max-w-md flex-col overflow-hidden bg-[#FDFBF6] py-2 ${interstateClosure ? "gap-2" : "space-y-4"}`}
      dir="rtl"
    >
      <div className="shrink-0 flex flex-col space-y-1">
        <DashboardWelcomeHeader fullName={firstName} nameLoading={greetingNameLoading} />
        
        {realParentDisplayId && (
          <div className="px-4 text-right flex flex-col items-start gap-1">
            <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 text-xs font-semibold px-2.5 py-1 rounded-lg border border-purple-100 shadow-sm animate-in fade-in duration-200">
              <span className="text-[10px] bg-purple-200 text-purple-800 px-1 rounded uppercase font-bold">ID</span>
              מזהה: {realParentDisplayId}
            </span>
          </div>
        )}
      </div>

      {!isOnboardingDone ? (
        <section className="shrink-0 px-1">
          <button
            type="button"
            onClick={() => router.push("/parent/onboarding")}
            className="flex w-full min-h-[3.5rem] items-center justify-center rounded-2xl bg-navy-header px-5 py-4 text-base font-bold text-white shadow-soft transition hover:brightness-110 active:scale-[0.99]"
          >
            התחלת שאלון התאמה
          </button>
        </section>
      ) : null}

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

      {interstateClosure || hideSearchShortcuts ? null : (
      <section className="shrink-0 rounded-3xl bg-white p-4 shadow-soft sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href="/parent/calendar"
            className="group flex min-h-[6rem] flex-row-reverse items-center justify-between gap-4 rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 p-4 text-right text-navy-header shadow-sm transition hover:border-navy-header/25 hover:shadow-md active:scale-[0.98] sm:flex-col sm:items-end sm:justify-between sm:min-h-[7.25rem]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-navy-header/10">
              <Calendar className="h-7 w-7 stroke-[1.75]" aria-hidden />
            </span>
            <span className="text-sm font-bold sm:text-xs">יומן משמרות</span>
          </Link>

          <div className="grid grid-cols-2 gap-3 sm:col-span-2">
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
              href="/parent/history"
              className="group flex min-h-[7.25rem] flex-col items-end justify-between gap-2 rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 p-3 text-right text-navy-header shadow-sm transition hover:border-navy-header/25 hover:shadow-md active:scale-[0.98]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-navy-header/10">
                <History className="h-7 w-7 stroke-[1.75]" aria-hidden />
              </span>
              <span className="w-full text-right text-xs font-semibold leading-snug sm:text-sm">היסטוריית שמרטפות</span>
            </Link>
          </div>
        </div>

        {/* כפתור AnyNanny NOW */}
        <button
          type="button"
          disabled={nowBusy}
          onClick={handleAnyNannyNowClick}
          className="mt-3 flex w-full min-h-[3.75rem] flex-row-reverse items-center justify-between gap-3 rounded-2xl border border-red-200 bg-gradient-to-br from-[#FFF5F5] to-[#FFF2F2] px-4 py-3 text-right shadow-sm ring-1 ring-red-500/10 transition hover:scale-[1.01] active:scale-[0.99]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white shadow-md animate-pulse">
            <Zap className="h-5 w-5 fill-white" />
          </span>
          <div className="min-w-0 flex-1 space-y-0.5 text-right">
            <span className="block text-sm font-black text-red-950">AnyNanny NOW</span>
            <span className="block text-[11px] font-bold text-red-600/90">הפעלת קריאה מיידית — מענה מעכשיו לעכשיו</span>
          </div>
        </button>

        <Link
          href="/parent/search"
          className="mt-3 flex min-h-[3.5rem] flex-row-reverse items-center justify-between gap-3 rounded-2xl border border-emerald-700/20 bg-emerald-50/80 px-4 py-3 text-right text-navy-header shadow-sm transition hover:border-emerald-700/35 hover:shadow-md active:scale-[0.99]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-emerald-800/15">
            <Search className="h-5 w-5 text-emerald-800" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 text-sm font-bold leading-snug text-emerald-950">לוח חיפוש רגיל — תזמון מראש וביקורות</span>
        </Link>
      </section>
      )}

      {showShiftPanel ? (
      <DoubleShakeShiftPanel className={`min-h-0 flex-1 ${interstateClosure ? "!mt-0 !p-2 sm:!p-3" : ""}`}>
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
              {(sessionStatus === "active" || waitingNannyEnd) && (
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
                שלחנו את הבקשה לבייביסיטר — תקבלו עדכון כאן ברגע שתאשר או דחה.
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
            align={interstateClosure ? "start" : "center"}
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
            </div>
          ) : showParentConfirmEnd ? (
            <div className="flex w-full flex-col items-center justify-center gap-3 pt-2 text-center">
              <p className="text-sm font-semibold text-navy-800">הבייביסיטר סיימ/ה את המשמרת</p>
              <p className="text-4xl font-bold tabular-nums tracking-wide text-[#001F3F]">{timerText}</p>
              <p className="text-sm font-semibold text-navy-800">סכום לתשלום: ₪{earnedNis}</p>
              <DoubleShakeCircleButton
                label={confirmEndBusy ? "מאשר…" : "אישור סיום משמרת"}
                variant="salmon"
                busy={confirmEndBusy}
                onClick={() => void handleParentConfirmEndShift()}
              />
              <button
                type="button"
                disabled={confirmEndBusy}
                onClick={() => setDebugToast("אפשר לאשר את סיום המשמרת כשתהיו מוכנים")}
                className="rounded-xl border border-slate-200 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                לא עכשיו
              </button>
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
              sessionActive={false}
              onStartShift={() => {
                if (parentShiftStatus === "sitter_started") {
                  void handleConfirmShiftStartClick();
                } else {
                  setDebugToast("יש להמתין שהבייביסיטר תלחץ על התחלת משמרת תחילה");
                }
              }}
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
              sessionActive={sessionStatus === "active"}
              onStartShift={() => handleConfirmShiftStartClick()}
            />
          ) : null}
          </DoubleShakeCircleSlot>
        </div>
      </DoubleShakeShiftPanel>
      ) : null}

      {parentBootstrapComplete && parentUserId && (
        <div className="w-full border-t border-slate-100 bg-slate-50/50 px-4 py-3 flex items-center justify-between gap-3 shrink-0 rounded-b-3xl">
          <button
            type="button"
            onClick={() => void handleParentEmergencyReset()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 shadow-sm transition hover:bg-amber-100 active:scale-[0.97]"
          >
            <span>שחרור משמרת תקועה</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 shadow-sm transition hover:bg-rose-50 active:scale-[0.97]"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>התנתקות</span>
          </button>
        </div>
      )}

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

      <ParentBookingResponseModal
        notification={activeBookingResponseNotification}
        busy={bookingResponseAckBusy}
        onAcknowledge={() => void handleAcknowledgeBookingResponse()}
      />

      {/* 🔥 מודאל בחירת אזור מהיר (2 קליקים) מובנה ומאובטח המרונדר דינמית מרשימת ה-Config הארצית SUPPORTED_CITIES */}
      {showCityModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs" dir="rtl">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500 shadow-inner">
              <Zap className="h-5 w-5 fill-current" />
            </div>
            
            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-800">אישור מיקום עבור AnyNanny NOW</h3>
              <p className="text-xs text-slate-500 font-medium">היכן אתה צריך את המטפלת מעכשיו לעכשיו?</p>
            </div>

            <div className="space-y-2">
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20"
              >
                {SUPPORTED_CITIES.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={nowBusy}
                onClick={handleLaunchBroadcast}
                className="flex-1 rounded-xl bg-red-500 py-3 text-xs font-bold text-white shadow-md hover:brightness-110 active:scale-[0.98] disabled:opacity-50 transition"
              >
                {nowBusy ? "משדר..." : "אישור ושידור ברק"}
              </button>
              <button
                type="button"
                disabled={nowBusy}
                onClick={() => setShowCityModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-500 hover:bg-slate-50 transition"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}