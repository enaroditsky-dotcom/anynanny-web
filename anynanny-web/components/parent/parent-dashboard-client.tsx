"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { ParentOnboardingWizard } from "@/components/parent/parent-onboarding-wizard";
import {
  DeclineNoticeUnit,
  type DeclineNoticeState
} from "@/components/parent/broadcast-decline-notice";
import { ParentSessionTimerCircle } from "@/components/session/parent-double-shake-idle-circle";
import { ParentSessionRatingPanel } from "@/components/session/parent-session-rating-panel";
import { DoubleShakeCircleButton } from "@/components/session/double-shake-circle-button";
import { ManualPaymentPanel } from "@/components/billing/ManualPaymentPanel";
import { useSession } from "@/context/SessionContext";
import { BOOKINGS_TABLE, type BookingRow } from "@/lib/bookings/constants";
import { parentApproveSitterStart } from "@/lib/bookings/parent-approve-sitter-start";
import { isParentArrivalConfirmableStatus } from "@/lib/bookings/booking-realtime-handler";
import {
  isBookingDueForParentActiveShiftUi,
  isFutureConfirmedScheduleBooking,
  isFutureScheduledBooking
} from "@/lib/bookings/booking-shift-ui";
import { formatBookingSchedule } from "@/lib/bookings/sitter-pending-bookings";
import { MissedShiftClarificationCard } from "@/components/bookings/missed-shift-clarification-card";
import {
  isMissedShiftLifecycleStatus,
  missedShiftRequiresViewerAction
} from "@/lib/bookings/missed-shift-lifecycle";
import {
  fetchMissedShiftLifecycleBookings,
  pickActionableMissedShiftBooking,
  reconcileUnstartedPastBookings,
  type MissedShiftBookingView
} from "@/lib/bookings/missed-shift-client";
import { useParentPendingBookingCount } from "@/lib/bookings/use-parent-pending-booking-count";
import { useCancellationAttention } from "@/lib/bookings/use-cancellation-attention";
import { CancellationAttentionDot } from "@/components/bookings/cancellation-attention-dot";
import { CancellationAttentionModals } from "@/components/bookings/cancellation-attention-modals";
import { PendingNoResponseReminderModal } from "@/components/bookings/pending-no-response-reminder-modal";
import { PendingWithdrawButton } from "@/components/bookings/pending-withdraw-button";
import { ReleaseStuckShiftModal } from "@/components/parent/release-stuck-shift-modal";
import {
  acknowledgeApprovedBookingNotification,
  isApprovedScheduleNotificationCandidate,
  persistDismissedApprovedBookingId,
  readDismissedApprovedBookingIds,
  shouldShowApprovedScheduleNotification
} from "@/lib/bookings/dismissed-approved-bookings";
import {
  acknowledgeRejectedBookingNotification,
  isRejectedWithNoteBooking,
  persistDismissedRejectedBookingId,
  readDismissedRejectedBookingIds,
  shouldShowRejectedNotification
} from "@/lib/bookings/dismissed-rejected-bookings";
import {
  ANYNANNY_NEW_BOOKING_EVENT,
  bookingAllowsSettlementClosureUi,
  consumeNewBookingMarker,
  isFreshLiveBookingStatus,
  type NewBookingEventDetail
} from "@/lib/bookings/new-booking-reset";
import { parentConfirmEndBooking } from "@/lib/bookings/parent-confirm-end-booking";
import {
  bookingRequiresAdminReview,
  hasConfirmedDoubleShakeStart,
  STUCK_SHIFT_REVIEW_LABEL,
  STUCK_SHIFT_REVIEW_SUPPORT
} from "@/lib/bookings/stuck-shift-review";
import {
  isBookingPaymentPaid,
  parsePaymentBookingIdParam,
  PARENT_PAYMENT_BOOKING_QUERY_PARAM
} from "@/lib/bookings/payment-status-label";
import {
  RELEASE_STUCK_SHIFT_COPY,
  markDisplayedStuckShiftForReview,
  resolveDisplayedStuckShiftTargets,
  type ReleaseStuckShiftReasonId
} from "@/lib/bookings/release-displayed-stuck-shift";
import { parseHypReturnParams } from "@/lib/billing/hyp/parse-return-params";
import {
  clearHypPendingCheckout,
  readHypPendingCheckout
} from "@/lib/billing/hyp/pending-checkout";
import { finalizeHypCheckoutFromClient } from "@/lib/billing/hyp/finalize-client";
import type { ManualPaymentMethod } from "@/lib/billing/manual-payment-lifecycle";
import { PARENT_PAYMENT_DISPUTE_BLOCKS_NEW_BOOKING_MESSAGE } from "@/lib/billing/manual-payment-lifecycle";
import {
  AWAITING_SITTER_CONFIRMATION_COPY,
  AWAITING_SITTER_CONFIRMATION_HEADING,
  AWAITING_SITTER_RATING_HEADING,
  PAYMENT_DISPUTE_HEADING,
  resolveParentManualSettlementStep,
  type ManualPaymentDestinations
} from "@/lib/billing/manual-payment-ui";
import type { ParentBusySlot, ParentPreferences } from "@/lib/parent/types";
import { fetchProfilePublicId, parentDashboardSerialLabel } from "@/lib/public/sequential-display-id";
import { fetchRejectedSitterSnapshot } from "@/lib/sitter/fetch-rejected-sitter-snapshot";
import {
  clearParentSessionRatedLocally,
  markParentSessionRatedLocally,
  parentHasRatedSession
} from "@/lib/ratings/parent-session-rated";
import { submitSessionRating } from "@/lib/ratings/submit-session-rating";
import {
  fetchUserRatingSummary,
  type UserRatingSummary
} from "@/lib/ratings/fetch-user-rating-summary";
import {
  computeLiveAccruedNis,
  computeLiveElapsedSecondsActive,
  formatElapsed,
  resolveLiveHourlyRateNis,
  SESSIONS_TABLE,
  type SupabaseSessionRow
} from "@/lib/session/protocol";
import {
  activateParentConfirmedSession,
  fetchLatestParentSessionRow,
  fetchSessionForBooking
} from "@/lib/session/sessions-query";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  removeRealtimeChannel,
  subscribePostgresChanges
} from "@/lib/supabase/subscribe-postgres-changes";
import { DashboardStatusCard } from "@/components/dashboard/dashboard-status-card";
import { setBroadcastMinimized } from "@/lib/broadcast/broadcast-minimize-preference";
import { Calendar, Wallet, History, LogOut, Search, CheckCircle2, Clock, Star, User, X } from "lucide-react";
import { IdentityStatusIndicator } from "@/components/identity/identity-status-indicator";

const BOOKING_LIVE_SELECT =
  "id, parent_id, sitter_id, status, booking_date, start_time, end_time, rejection_note, hourly_rate_nis, parent_notified_at, requires_admin_review, created_at, updated_at";

/** Fallback when `parent_notified_at` is not yet migrated. */
const BOOKING_LIVE_SELECT_LEGACY =
  "id, parent_id, sitter_id, status, booking_date, start_time, end_time, rejection_note, hourly_rate_nis, requires_admin_review, created_at, updated_at";

const LIVE_BOOKING_FETCH_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "sitter_started",
  "parent_started",
  "sitter_ended",
  "awaiting_missed_shift_reason",
  "did_not_occur",
  "happened_unverified",
  "missed_shift_disputed"
] as const;

const TIMER_BOOKING_STATUSES = new Set(["parent_started"]);

const LIVE_BOOKING_STATUS_PRIORITY = [
  "sitter_ended",
  "parent_started",
  "sitter_started",
  "approved",
  "pending"
] as const;

const SESSION_AWAITING_PARENT_END = new Set(["sitter_completed"]);
const SESSION_SETTLEMENT_STATUSES = new Set(["payment_pending", "paid"]);
const SESSION_SETTLEMENT_FETCH_STATUSES = [
  "payment_pending",
  "paid",
  "sitter_completed"
] as const;
const SESSION_ACTIVE_FETCH_STATUSES = ["pending", "active", "in_progress"] as const;

const POLL_MS = 5000;

type SettlementStep =
  | "payment"
  | "rating"
  | "waiting_sitter"
  | "dispute"
  | "waiting_sitter_rating";

const DISMISSED_SCHEDULED_STATUS_KEY = "anynanny_dismissed_scheduled_status_v1";

function readDismissedScheduledBookingIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(DISMISSED_SCHEDULED_STATUS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0));
  } catch {
    return new Set();
  }
}

function persistDismissedScheduledBookingId(bookingId: string): void {
  if (!bookingId.trim() || typeof window === "undefined") return;
  try {
    const next = readDismissedScheduledBookingIds();
    next.add(bookingId);
    window.sessionStorage.setItem(DISMISSED_SCHEDULED_STATUS_KEY, JSON.stringify([...next]));
  } catch {
    /* ignore */
  }
}

function normalizeStatus(status: unknown): string {
  return String(status ?? "").trim().toLowerCase();
}

function isUnpaidCompletedBooking(b: BookingRow): boolean {
  return (
    normalizeStatus(b.status) === "completed" &&
    !isBookingPaymentPaid({
      paymentStatus: b.payment_status,
      paidAt: b.paid_at
    })
  );
}

function readPaymentBookingIdFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (!params.has(PARENT_PAYMENT_BOOKING_QUERY_PARAM)) return null;
  const parsed = parsePaymentBookingIdParam(params.get(PARENT_PAYMENT_BOOKING_QUERY_PARAM));
  if (!parsed) {
    stripPaymentBookingIdFromUrl();
    return null;
  }
  return parsed;
}

function stripPaymentBookingIdFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(PARENT_PAYMENT_BOOKING_QUERY_PARAM)) return;
  url.searchParams.delete(PARENT_PAYMENT_BOOKING_QUERY_PARAM);
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", next);
}

async function fetchOwnedParentBookingById(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  parentId: string,
  bookingId: string
): Promise<BookingRow | null> {
  const id = parsePaymentBookingIdParam(bookingId);
  const uid = String(parentId ?? "").trim();
  if (!id || !uid) return null;

  const attempts = [
    `${BOOKING_LIVE_SELECT}, payment_status, paid_at`,
    BOOKING_LIVE_SELECT,
    BOOKING_LIVE_SELECT_LEGACY
  ];

  for (const select of attempts) {
    const { data, error } = await supabase
      .from(BOOKINGS_TABLE)
      .select(select)
      .eq("id", id)
      .eq("parent_id", uid)
      .maybeSingle();
    if (error) continue;
    return ((data as BookingRow | null) ?? null);
  }

  return null;
}

function pickParentDashboardBooking(
  rows: BookingRow[],
  opts?: {
    preferBookingId?: string | null;
    settlementLocked?: boolean;
    dismissedRejectedIds?: Set<string>;
    dismissedApprovedIds?: Set<string>;
    stickyApprovedNotificationId?: string | null;
  }
): BookingRow | null {
  if (!rows.length) return null;

  const preferId = opts?.preferBookingId
    ? String(opts.preferBookingId)
    : null;
  const dismissedRejectedIds = opts?.dismissedRejectedIds ?? new Set<string>();
  const dismissedApprovedIds = opts?.dismissedApprovedIds ?? new Set<string>();
  const stickyApprovedNotificationId = opts?.stickyApprovedNotificationId ?? null;

  const pendingRejectedNotification = (b: BookingRow) =>
    shouldShowRejectedNotification(b, dismissedRejectedIds);

  const pendingApprovedNotification = (b: BookingRow) =>
    isApprovedScheduleNotificationCandidate(
      b,
      dismissedApprovedIds,
      stickyApprovedNotificationId
    );

  // בזמן Settlement אסור לעבור להזמנה אחרת.
  if (opts?.settlementLocked) {
    if (preferId) {
      const preferred = rows.find(
        (b) => String(b.id) === preferId
      );

      if (preferred) {
        return preferred;
      }
    }

    const unpaidCompleted = rows.find(
      isUnpaidCompletedBooking
    );

    if (unpaidCompleted) {
      return unpaidCompleted;
    }
  }

  const dueLive = rows.filter(
    (b) =>
      isBookingDueForParentActiveShiftUi(b) &&
      !bookingRequiresAdminReview(b) &&
      !isMissedShiftLifecycleStatus(b.status)
  );

  for (const status of LIVE_BOOKING_STATUS_PRIORITY) {
    const hit = dueLive.find(
      (b) => normalizeStatus(b.status) === status
    );

    if (hit) return hit;
  }

  if (preferId) {
    const preferred = rows.find(
      (b) => String(b.id) === preferId
    );

    if (
      preferred &&
      !bookingRequiresAdminReview(preferred) &&
      (
        isBookingDueForParentActiveShiftUi(preferred) ||
        isUnpaidCompletedBooking(preferred) ||
        pendingRejectedNotification(preferred) ||
        pendingApprovedNotification(preferred)
      )
    ) {
      return preferred;
    }
  }

  const unpaidCompleted = rows.find(
    isUnpaidCompletedBooking
  );

  if (unpaidCompleted) {
    return unpaidCompleted;
  }

  const rejectedHit = rows.find(pendingRejectedNotification);

  if (rejectedHit) {
    return rejectedHit;
  }

  const futureConfirmed = rows.find(pendingApprovedNotification);

  if (futureConfirmed) {
    return futureConfirmed;
  }

  const futurePending = rows.find(
    (b) => isFutureScheduledBooking(b) && !isFutureConfirmedScheduleBooking(b)
  );

  if (futurePending) {
    return futurePending;
  }

  const fallbackRow = rows.find(
    (b) =>
      !bookingRequiresAdminReview(b) &&
      (!isRejectedWithNoteBooking(b) || pendingRejectedNotification(b))
  );

  return dueLive[0] ?? fallbackRow ?? null;
}

function sessionMatchesBookingSitter(
  session: SupabaseSessionRow | null | undefined,
  booking: BookingRow | null | undefined
): boolean {
  if (!session || !booking?.sitter_id) return true;
  if (session.sitter_id == null || String(session.sitter_id).trim() === "") return true;
  return String(session.sitter_id) === String(booking.sitter_id);
}

function isLiveInFlightBooking(status: unknown): boolean {
  return (LIVE_BOOKING_STATUS_PRIORITY as readonly string[]).includes(normalizeStatus(status));
}

function isLiveTimerBooking(status: unknown): boolean {
  return TIMER_BOOKING_STATUSES.has(normalizeStatus(status));
}

function isTerminalSessionStatus(status: unknown): boolean {
  const s = normalizeStatus(status);
  return s === "completed" || s === "cancelled" || s === "paid";
}

function isConfirmableBooking(status: unknown): boolean {
  return isParentArrivalConfirmableStatus(status as BookingRow["status"]);
}

function isWaitingForSitterArrival(booking: BookingRow | null | undefined): boolean {
  if (!booking) return false;
  if (isMissedShiftLifecycleStatus(booking.status)) return false;
  return (
    normalizeStatus(booking.status) === "approved" &&
    isBookingDueForParentActiveShiftUi(booking)
  );
}

function sessionRequestsEnd(session: SupabaseSessionRow | null): boolean {
  if (!session) return false;
  if (SESSION_AWAITING_PARENT_END.has(normalizeStatus(session.status))) return true;
  if (session.parent_end_requested_at != null && String(session.parent_end_requested_at).length > 0) {
    return true;
  }
  if (session.end_requested === true) return true;
  return false;
}

function isAwaitingEndApproval(
  booking: BookingRow | null,
  session: SupabaseSessionRow | null
): boolean {
  const sessionStatus = normalizeStatus(session?.status);
  if (SESSION_SETTLEMENT_STATUSES.has(sessionStatus)) return false;
  if (normalizeStatus(booking?.status) === "sitter_ended") return true;
  if (sessionRequestsEnd(session)) return true;
  return false;
}

function isSettlementSession(session: SupabaseSessionRow | null): boolean {
  return SESSION_SETTLEMENT_STATUSES.has(normalizeStatus(session?.status));
}

function isActiveSessionRow(row: SupabaseSessionRow | null): boolean {
  if (!row?.start_time) return false;
  const s = normalizeStatus(row.status);
  return s === "active" || s === "in_progress";
}

function sessionRank(status: unknown): number {
  const s = normalizeStatus(status);
  if (s === "paid") return 40;
  if (s === "payment_pending") return 30;
  if (s === "sitter_completed") return 20;
  if (s === "active" || s === "in_progress") return 10;
  return 0;
}

function preferStrongerSession(
  current: SupabaseSessionRow | null,
  incoming: SupabaseSessionRow | null,
  opts?: { preferSitterId?: string | null }
): SupabaseSessionRow | null {
  if (!incoming) return current;
  if (!current) return incoming;

  const preferSitter = opts?.preferSitterId ? String(opts.preferSitterId) : null;
  if (preferSitter) {
    const curMatch = String(current.sitter_id ?? "") === preferSitter;
    const inMatch = String(incoming.sitter_id ?? "") === preferSitter;
    if (curMatch && !inMatch) return current;
    if (!curMatch && inMatch) return incoming;
  }

  const incomingRank = sessionRank(incoming.status);
  const currentRank = sessionRank(current.status);
  if (String(current.id) === String(incoming.id)) {
    return incomingRank >= currentRank
      ? { ...current, ...incoming }
      : { ...incoming, ...current };
  }
  return incomingRank >= currentRank ? incoming : current;
}

export function ParentDashboardClient({
  initialPreferences,
  initialActiveBooking,
  initialAvatarUrl = null
}: {
  initialProfiles?: any[];
  initialPreferences: ParentPreferences & { parentSerial?: string };
  initialBusySlots?: ParentBusySlot[];
  initialActiveBooking?: BookingRow | null;
  initialAvatarUrl?: string | null;
}) {
  const { nowMs } = useSession();
  const [prefs, setPrefs] = useState(initialPreferences);
  const [parentSerial, setParentSerial] = useState<string>(initialPreferences.parentSerial || "");
  const [parentAvatarUrl, setParentAvatarUrl] = useState<string | null>(
    initialAvatarUrl?.trim() || null
  );
  const [statusCardCollapsed, setStatusCardCollapsed] = useState(false);
  const [dismissedStatusKey, setDismissedStatusKey] = useState<string | null>(null);
  const [dismissedScheduledBookingIds, setDismissedScheduledBookingIds] = useState<Set<string>>(
    () => new Set()
  );
  const [dismissedRejectedBookingIds, setDismissedRejectedBookingIds] = useState<Set<string>>(
    () => new Set()
  );
  const dismissedRejectedBookingIdsRef = useRef<Set<string>>(dismissedRejectedBookingIds);
  dismissedRejectedBookingIdsRef.current = dismissedRejectedBookingIds;
  const [dismissedApprovedBookingIds, setDismissedApprovedBookingIds] = useState<Set<string>>(
    () => new Set()
  );
  const dismissedApprovedBookingIdsRef = useRef<Set<string>>(dismissedApprovedBookingIds);
  dismissedApprovedBookingIdsRef.current = dismissedApprovedBookingIds;
  const [stickyApprovedNotificationId, setStickyApprovedNotificationId] = useState<string | null>(
    null
  );
  const stickyApprovedNotificationIdRef = useRef<string | null>(null);
  const acknowledgedApprovedIdsRef = useRef<Set<string>>(new Set());
  const [parentRatingSummary, setParentRatingSummary] = useState<UserRatingSummary>({
    average: 0,
    count: 0
  });
  const [hasHydrated, setHasHydrated] = useState(false);
  const [parentId, setParentId] = useState<string | null>(
    initialActiveBooking?.parent_id ? String(initialActiveBooking.parent_id) : null
  );
  const pendingSitterApprovalCount = useParentPendingBookingCount(parentId, Boolean(parentId));
  const cancellationAttention = useCancellationAttention(parentId, "parent", Boolean(parentId));
  const [profileCardStatus] = useState<"loading" | "complete" | "incomplete">("complete");
  const [activeBooking, setActiveBooking] = useState<BookingRow | null>(
    (initialActiveBooking as BookingRow | null | undefined) ?? null
  );
  const [activeSession, setActiveSession] = useState<SupabaseSessionRow | null>(null);
  const [shiftError, setShiftError] = useState<string | null>(null);
  const [confirmPending, startConfirmTransition] = useTransition();
  const [confirmEndPending, startConfirmEndTransition] = useTransition();
  const [settlementStep, setSettlementStep] = useState<SettlementStep | null>(null);
  const [manualPaymentMethod, setManualPaymentMethod] = useState<ManualPaymentMethod | null>(
    null
  );
  const [manualPaymentDestinations, setManualPaymentDestinations] =
    useState<ManualPaymentDestinations | null>(null);
  const [manualPaymentDestinationsLoading, setManualPaymentDestinationsLoading] =
    useState(false);
  const [manualPaymentBusy, setManualPaymentBusy] = useState(false);
  const manualPaymentInFlightRef = useRef(false);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [sitterAcceptedToast, setSitterAcceptedToast] = useState<string | null>(null);
  const [rejectedDeclineNotice, setRejectedDeclineNotice] =
    useState<DeclineNoticeState | null>(null);
  const capturedRejectedBookingIdRef = useRef<string>("");
  const lastSitterAcceptedToastKeyRef = useRef<string | null>(null);
  const bookingStatusWatchRef = useRef<{ id: string; status: string } | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const settlementLockRef = useRef<SettlementStep | null>(null);
  const activeSessionRef = useRef<SupabaseSessionRow | null>(null);
  const activeBookingRef = useRef<BookingRow | null>(null);
  activeSessionRef.current = activeSession;
  activeBookingRef.current = activeBooking;

  const currentHourlyRate = useMemo(
    () => resolveLiveHourlyRateNis(activeBooking?.hourly_rate_nis),
    [activeBooking?.hourly_rate_nis]
  );

  const lockSettlement = useCallback((step: SettlementStep) => {
    settlementLockRef.current = step;
    setSettlementStep(step);
  }, []);

  const clearSettlementLock = useCallback(() => {
    settlementLockRef.current = null;
    setSettlementStep(null);
  }, []);

  useEffect(() => {
    setHasHydrated(true);
    setDismissedScheduledBookingIds(readDismissedScheduledBookingIds());
  }, []);

  useEffect(() => {
    if (!parentId) {
      setDismissedRejectedBookingIds(new Set());
      dismissedRejectedBookingIdsRef.current = new Set();
      setDismissedApprovedBookingIds(new Set());
      dismissedApprovedBookingIdsRef.current = new Set();
      stickyApprovedNotificationIdRef.current = null;
      setStickyApprovedNotificationId(null);
      acknowledgedApprovedIdsRef.current = new Set();
      return;
    }
    const dismissedRejected = readDismissedRejectedBookingIds(parentId);
    setDismissedRejectedBookingIds(dismissedRejected);
    dismissedRejectedBookingIdsRef.current = dismissedRejected;
    const dismissedApproved = readDismissedApprovedBookingIds(parentId);
    setDismissedApprovedBookingIds(dismissedApproved);
    dismissedApprovedBookingIdsRef.current = dismissedApproved;
  }, [parentId]);

  const refreshParentOnboardingStatus = useCallback(
    async (supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>, uid: string) => {
      const { data, error } = await supabase
        .from("profiles")
        .select("first_name, last_name, avatar_url")
        .eq("id", uid)
        .maybeSingle();

      if (!error && data) {
        if (data.first_name) {
          setPrefs((prev) => ({
            ...prev,
            parentName: `${data.first_name} ${data.last_name || ""}`.trim()
          }));
        }
        const avatar = typeof data.avatar_url === "string" ? data.avatar_url.trim() : "";
        setParentAvatarUrl(avatar || null);
      }

      const { publicId } = await fetchProfilePublicId(supabase, uid, "parent");
      if (publicId) setParentSerial(publicId);
    },
    []
  );

  const refreshParentRatingSummary = useCallback(
    async (uid: string) => {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        return;
      }

      const summary = await fetchUserRatingSummary(
        supabase,
        uid
      );

      setParentRatingSummary(summary);
    },
    []
  );

  const clearToIdleDashboard = useCallback(() => {
    settlementLockRef.current = null;
    setSettlementStep(null);
    setActiveBooking(null);
    activeBookingRef.current = null;
    setActiveSession(null);
    activeSessionRef.current = null;
  }, []);

  const [releasingStuckShift, setReleasingStuckShift] = useState(false);
  const [releaseStuckModalOpen, setReleaseStuckModalOpen] = useState(false);
  const [releaseStuckModalError, setReleaseStuckModalError] = useState<string | null>(null);
  const [stuckShiftReviewNotice, setStuckShiftReviewNotice] = useState(false);
  const [missedShiftBooking, setMissedShiftBooking] = useState<MissedShiftBookingView | null>(null);
  const dismissedMissedShiftIdsRef = useRef<Set<string>>(new Set());

  const refreshLiveShiftState = useCallback(async (uid: string) => {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }
    refreshInFlightRef.current = true;

    const settlementIsLocked = () => settlementLockRef.current !== null;

    try {
      do {
        refreshQueuedRef.current = false;
        const supabase = getSupabaseBrowserClient();
        if (!supabase) return;

        await reconcileUnstartedPastBookings(supabase);
        const missedRows = await fetchMissedShiftLifecycleBookings(supabase, uid, "parent");
        setMissedShiftBooking(
          pickActionableMissedShiftBooking(
            missedRows,
            "parent",
            dismissedMissedShiftIdsRef.current
          )
        );

        const localSessionId = activeSessionRef.current?.id
          ? String(activeSessionRef.current.id)
          : null;

        const recoverSettlementStepIfUnlocked = async (
          session: SupabaseSessionRow | null | undefined,
          bookingForPayment?: BookingRow | null
        ) => {
          const lifecycle = resolveParentManualSettlementStep({
            paymentStatus: bookingForPayment?.payment_status,
            paidAt: bookingForPayment?.paid_at
          });
          if (
            lifecycle === "waiting_sitter" ||
            lifecycle === "dispute" ||
            lifecycle === "waiting_sitter_rating"
          ) {
            lockSettlement(lifecycle);
            return;
          }

          if (!session?.id) return;
          if (normalizeStatus(session.status) !== "payment_pending") return;
          if (settlementIsLocked()) return;

          const rated = await parentHasRatedSession(
            supabase,
            String(session.id),
            uid
          );

          if (settlementIsLocked()) return;

          lockSettlement(
            rated ? "payment" : "rating"
          );
        };

        let bookingRows: BookingRow[] = [];
        let bookingQueryFailed = false;
        const bookingFull = await supabase
          .from(BOOKINGS_TABLE)
          .select(`${BOOKING_LIVE_SELECT}, payment_status, paid_at`)
          .eq("parent_id", uid)
          .in("status", [...LIVE_BOOKING_FETCH_STATUSES, "completed"])
          .order("updated_at", { ascending: false })
          .limit(8);

        if (bookingFull.error) {
          const bookingCore = await supabase
            .from(BOOKINGS_TABLE)
            .select(BOOKING_LIVE_SELECT)
            .eq("parent_id", uid)
            .in("status", [...LIVE_BOOKING_FETCH_STATUSES, "completed"])
            .order("updated_at", { ascending: false })
            .limit(8);
          if (bookingCore.error) {
            const legacy = await supabase
              .from(BOOKINGS_TABLE)
              .select(BOOKING_LIVE_SELECT_LEGACY)
              .eq("parent_id", uid)
              .in("status", [...LIVE_BOOKING_FETCH_STATUSES, "completed"])
              .order("updated_at", { ascending: false })
              .limit(8);
            if (legacy.error) {
              bookingQueryFailed = true;
            } else {
              bookingRows = (legacy.data as BookingRow[] | null) ?? [];
            }
          } else {
            bookingRows = (bookingCore.data as BookingRow[] | null) ?? [];
          }
        } else {
          bookingRows = (bookingFull.data as BookingRow[] | null) ?? [];
        }

        if (bookingQueryFailed) {
          continue;
        }

        const requestedPaymentBookingId = readPaymentBookingIdFromLocation();
        let paymentRecoveryBooking: BookingRow | null = null;
        if (requestedPaymentBookingId) {
          const owned = await fetchOwnedParentBookingById(
            supabase,
            uid,
            requestedPaymentBookingId
          );
          if (!owned) {
            stripPaymentBookingIdFromUrl();
          } else if (
            isBookingPaymentPaid({
              paymentStatus: owned.payment_status,
              paidAt: owned.paid_at
            })
          ) {
            stripPaymentBookingIdFromUrl();
          } else if (normalizeStatus(owned.status) !== "completed") {
            stripPaymentBookingIdFromUrl();
          } else {
            paymentRecoveryBooking = owned;
            if (!bookingRows.some((row) => String(row.id) === String(owned.id))) {
              bookingRows = [owned, ...bookingRows];
            }
          }
        }

        // Always re-read parent-scoped dismissals from localStorage so login/refresh
        // cannot resurface a booking the parent already dismissed with X.
        const dismissedRejectedIds = readDismissedRejectedBookingIds(uid);
        dismissedRejectedBookingIdsRef.current = dismissedRejectedIds;
        setDismissedRejectedBookingIds(dismissedRejectedIds);
        const dismissedApprovedIds = readDismissedApprovedBookingIds(uid);
        dismissedApprovedBookingIdsRef.current = dismissedApprovedIds;
        setDismissedApprovedBookingIds(dismissedApprovedIds);

        const preferDashboardBookingId =
          paymentRecoveryBooking?.id ?? activeBookingRef.current?.id ?? null;
        const booking = paymentRecoveryBooking ?? pickParentDashboardBooking(bookingRows, {
          preferBookingId: preferDashboardBookingId,
          settlementLocked: settlementIsLocked(),
          dismissedRejectedIds,
          dismissedApprovedIds,
          stickyApprovedNotificationId: stickyApprovedNotificationIdRef.current
        });
        setStuckShiftReviewNotice(bookingRows.some((row) => bookingRequiresAdminReview(row)));
        const bookingSitterId =
          booking?.sitter_id != null ? String(booking.sitter_id) : null;
        const bookingStatus = normalizeStatus(booking?.status);
        const lifecycleStep = resolveParentManualSettlementStep({
          paymentStatus: booking?.payment_status,
          paidAt: booking?.paid_at
        });
        if (
          lifecycleStep === "waiting_sitter" ||
          lifecycleStep === "dispute" ||
          lifecycleStep === "waiting_sitter_rating"
        ) {
          lockSettlement(lifecycleStep);
        }
        const dueForActiveShift = Boolean(
          booking && isBookingDueForParentActiveShiftUi(booking)
        );
        const futureScheduled = Boolean(booking && isFutureScheduledBooking(booking));
        const hasLiveBooking = Boolean(
          booking && isLiveInFlightBooking(bookingStatus) && dueForActiveShift
        );
        const hasUnpaidCompleted = Boolean(booking && isUnpaidCompletedBooking(booking));
        const liveClosureRequested = bookingStatus === "sitter_ended";
        const isFreshLiveShift =
          hasLiveBooking && isFreshLiveBookingStatus(bookingStatus);

        if (isFreshLiveShift) {
          if (!settlementIsLocked()) {
            clearSettlementLock();
          }
          const heldStatus = normalizeStatus(activeSessionRef.current?.status);
          if (
            SESSION_SETTLEMENT_STATUSES.has(heldStatus) ||
            SESSION_AWAITING_PARENT_END.has(heldStatus)
          ) {
            if (!settlementIsLocked()) {
              setActiveSession(null);
              activeSessionRef.current = null;
            }
          }
        }

        if (localSessionId && typeof localSessionId === "string" && localSessionId.trim() !== "" && localSessionId !== "undefined" && localSessionId !== "null") {
          const byId = await supabase
            .from(SESSIONS_TABLE)
            .select(
              "id, parent_id, sitter_id, status, start_time, end_time, final_elapsed_seconds, final_amount_nis, parent_end_requested_at"
            )
            .eq("id", localSessionId)
            .eq("parent_id", uid)
            .maybeSingle();

          if (!byId.error) {
            const row = (byId.data as SupabaseSessionRow | null) ?? null;
            if (!row || isTerminalSessionStatus(row.status)) {
              if (!hasLiveBooking && !hasUnpaidCompleted) {
                if (!settlementIsLocked()) {
                  clearToIdleDashboard();
                  continue;
                }
              }
              if (!settlementIsLocked()) {
                setActiveSession(null);
                activeSessionRef.current = null;
              }
            } else if (isActiveSessionRow(row) && !hasLiveBooking) {
              if (!settlementIsLocked()) {
                clearToIdleDashboard();
                continue;
              }
            } else if (
              isFreshLiveShift &&
              (SESSION_SETTLEMENT_STATUSES.has(normalizeStatus(row.status)) ||
                SESSION_AWAITING_PARENT_END.has(normalizeStatus(row.status)))
            ) {
              if (!settlementIsLocked()) {
                setActiveSession(null);
                activeSessionRef.current = null;
              }
            } else {
              const next = preferStrongerSession(activeSessionRef.current, row, {
                preferSitterId: bookingSitterId
              });
              setActiveSession(next);
              activeSessionRef.current = next;
            }
          }
        }

        const showRejectedNotification = shouldShowRejectedNotification(
          booking,
          dismissedRejectedIds
        );

        if (!hasLiveBooking && !hasUnpaidCompleted && !showRejectedNotification) {
          if (settlementIsLocked()) {
            const settlementSession = await fetchLatestParentSessionRow(supabase, uid, {
              statuses: [...SESSION_SETTLEMENT_STATUSES],
              orderBy: "created_at",
              ascending: false
            });
            if (
              settlementSession.row &&
              SESSION_SETTLEMENT_STATUSES.has(normalizeStatus(settlementSession.row.status))
            ) {
              setActiveSession(settlementSession.row);
              activeSessionRef.current = settlementSession.row;
              const st = normalizeStatus(settlementSession.row.status);
              if (st === "paid" && !settlementIsLocked()) {
                clearToIdleDashboard();
              }
              continue;
            }
          }
          if (booking && futureScheduled) {
            setActiveBooking(booking);
            activeBookingRef.current = booking;
            if (!settlementIsLocked()) {
              setActiveSession(null);
              activeSessionRef.current = null;
              clearSettlementLock();
            }
            continue;
          }

          if (showRejectedNotification && booking) {
            setActiveBooking(booking);
            activeBookingRef.current = booking;
            if (!settlementIsLocked()) {
              setActiveSession(null);
              activeSessionRef.current = null;
              clearSettlementLock();
            }
            continue;
          }

          if (!settlementIsLocked()) {
            clearToIdleDashboard();
          }
          continue;
        }

        if (booking) {
          setActiveBooking(booking);
          activeBookingRef.current = booking;
        }

        if (showRejectedNotification) {
          if (!settlementIsLocked()) {
            clearToIdleDashboard();
          }
          setActiveBooking(booking);
          activeBookingRef.current = booking;
          continue;
        }

        if (isFreshLiveShift) {
          if (!settlementIsLocked()) {
            clearSettlementLock();
          }

          if (bookingStatus === "pending" || bookingStatus === "approved") {
            if (!settlementIsLocked()) {
              setActiveSession(null);
              activeSessionRef.current = null;
            }
            continue;
          }

          if (!booking?.id) {
            if (!settlementIsLocked()) {
              clearToIdleDashboard();
            }
            continue;
          }

          const byBooking = await fetchSessionForBooking(supabase, {
            parentId: uid,
            bookingId: String(booking.id),
            statuses: [...SESSION_ACTIVE_FETCH_STATUSES],
            orderBy: "created_at",
            ascending: false
          });

          if (byBooking.row && isActiveSessionRow(byBooking.row)) {
            setActiveSession(byBooking.row);
            activeSessionRef.current = byBooking.row;
          } else if (!settlementIsLocked()) {
            setActiveSession(null);
            activeSessionRef.current = null;
          }
          continue;
        }

        const settlementSession = paymentRecoveryBooking
          ? { row: null as SupabaseSessionRow | null }
          : await fetchLatestParentSessionRow(supabase, uid, {
              statuses: [...SESSION_SETTLEMENT_FETCH_STATUSES],
              orderBy: "created_at",
              ascending: false
            });

        let settlementRow = settlementSession.row;
        if (
          settlementRow &&
          bookingSitterId &&
          !sessionMatchesBookingSitter(settlementRow, booking)
        ) {
          settlementRow = null;
        }

        const bookingAllowsSettlementUi =
          bookingAllowsSettlementClosureUi(bookingStatus) ||
          (!hasLiveBooking && (settlementIsLocked() || hasUnpaidCompleted));
        if (settlementRow && !bookingAllowsSettlementUi) {
          settlementRow = null;
        }

        if (settlementIsLocked() && !isFreshLiveShift) {
          if (
            settlementRow &&
            SESSION_SETTLEMENT_STATUSES.has(
              normalizeStatus(settlementRow.status)
            )
          ) {
            const next = preferStrongerSession(
              activeSessionRef.current,
              settlementRow,
              {
                preferSitterId: bookingSitterId
              }
            );

            setActiveSession(next);
            activeSessionRef.current = next;
          }

          continue;
        }

        if (settlementRow) {
          const next = preferStrongerSession(activeSessionRef.current, settlementRow, {
            preferSitterId: bookingSitterId
          });
          setActiveSession(next);
          activeSessionRef.current = next;
          const st = normalizeStatus(next?.status);
          if (st === "payment_pending" && next?.id) {
            await recoverSettlementStepIfUnlocked(next, booking);
          } else if (st === "paid" && !settlementIsLocked()) {
            clearToIdleDashboard();
          } else if ((st === "sitter_completed" || liveClosureRequested) && !settlementIsLocked()) {
            settlementLockRef.current = null;
            setSettlementStep(null);
          }
          continue;
        }

        if (!booking?.id) {
          if (!settlementIsLocked()) {
            clearToIdleDashboard();
          }
          continue;
        }

        const byBooking = await fetchSessionForBooking(supabase, {
          parentId: uid,
          bookingId: String(booking.id),
          statuses: [
            ...SESSION_SETTLEMENT_FETCH_STATUSES,
            ...SESSION_ACTIVE_FETCH_STATUSES
          ],
          orderBy: "created_at",
          ascending: false
        });

        if (byBooking.row) {
          const rowStatus = normalizeStatus(byBooking.row.status);
          if (
            !bookingAllowsSettlementUi &&
            (SESSION_SETTLEMENT_STATUSES.has(rowStatus) ||
              SESSION_AWAITING_PARENT_END.has(rowStatus))
          ) {
            if (!settlementIsLocked()) {
              setActiveSession(null);
              activeSessionRef.current = null;
              settlementLockRef.current = null;
              setSettlementStep(null);
            }
            continue;
          }

          const next = preferStrongerSession(activeSessionRef.current, byBooking.row, {
            preferSitterId: bookingSitterId
          });
          setActiveSession(next);
          activeSessionRef.current = next;
          const st = normalizeStatus(next?.status);
          if (st === "payment_pending" && next?.id) {
            await recoverSettlementStepIfUnlocked(next, booking);
          } else if (st === "paid" && !settlementIsLocked()) {
            clearToIdleDashboard();
          } else if ((st === "sitter_completed" || liveClosureRequested || sessionRequestsEnd(next)) && !settlementIsLocked()) {
            settlementLockRef.current = null;
            setSettlementStep(null);
          }
          continue;
        }

        if (liveClosureRequested) {
          if (isActiveSessionRow(activeSessionRef.current) && !settlementIsLocked()) {
            setActiveSession(null);
            activeSessionRef.current = null;
          }
          if (!settlementIsLocked()) {
            settlementLockRef.current = null;
            setSettlementStep(null);
          }
          continue;
        }

        if (!settlementIsLocked()) {
          setActiveSession(null);
          activeSessionRef.current = null;
          settlementLockRef.current = null;
          setSettlementStep(null);
        }
      } while (refreshQueuedRef.current);
    } finally {
      refreshInFlightRef.current = false;
      if (refreshQueuedRef.current) {
        void refreshLiveShiftState(uid);
      }
    }
  }, [clearToIdleDashboard, clearSettlementLock, lockSettlement]);

  const handleOpenReleaseStuckShiftModal = useCallback(() => {
    if (releasingStuckShift) return;
    setReleaseStuckModalError(null);
    setReleaseStuckModalOpen(true);
  }, [releasingStuckShift]);

  const handleCloseReleaseStuckShiftModal = useCallback(() => {
    if (releasingStuckShift) return;
    setReleaseStuckModalOpen(false);
    setReleaseStuckModalError(null);
  }, [releasingStuckShift]);

  const handleConfirmReleaseStuckShift = useCallback(async (
    reasonId: ReleaseStuckShiftReasonId,
    detail: string
  ) => {
    if (releasingStuckShift) return;

    const targets = resolveDisplayedStuckShiftTargets(activeBooking, activeSession);
    if ("error" in targets) {
      setReleaseStuckModalError(targets.error);
      setShiftError(targets.error);
      return;
    }

    setReleasingStuckShift(true);
    setReleaseStuckModalError(null);
    setShiftError(null);

    try {
      const auth = await resolveBrowserAuth();
      if (!auth.ok) {
        const message = RELEASE_STUCK_SHIFT_COPY.genericFailure;
        setReleaseStuckModalError(message);
        setShiftError(message);
        return;
      }

      const result = await markDisplayedStuckShiftForReview(auth.supabase, {
        actorId: auth.userId,
        actorRole: "parent",
        parentId: auth.userId,
        bookingId: targets.bookingId,
        sessionId: targets.sessionId,
        reasonId,
        detail
      });

      if (!result.ok) {
        setReleaseStuckModalError(result.error);
        setShiftError(result.error);
        await refreshLiveShiftState(auth.userId).catch(() => undefined);
        return;
      }

      setStuckShiftReviewNotice(true);
      await refreshLiveShiftState(auth.userId).catch(() => undefined);
      setReleaseStuckModalOpen(false);
    } catch (err) {
      console.warn("[parent-dashboard] release stuck shift", err);
      const message = RELEASE_STUCK_SHIFT_COPY.genericFailure;
      setReleaseStuckModalError(message);
      setShiftError(message);
      if (parentId) {
        await refreshLiveShiftState(parentId).catch(() => undefined);
      }
    } finally {
      setReleasingStuckShift(false);
    }
  }, [
    releasingStuckShift,
    activeBooking,
    activeSession,
    parentId,
    refreshLiveShiftState
  ]);

  const handlePendingWithdrawn = useCallback(
    (bookingId: string) => {
      setShiftError(null);
      setActiveBooking((prev) => {
        if (!prev || String(prev.id) !== bookingId) return prev;
        activeBookingRef.current = null;
        return null;
      });
      if (parentId) void refreshLiveShiftState(parentId);
    },
    [parentId, refreshLiveShiftState]
  );

  useEffect(() => {
    const applyNewBooking = (detail: NewBookingEventDetail | null | undefined) => {
      if (!detail?.bookingId) {
        clearToIdleDashboard();
        return;
      }
      clearToIdleDashboard();
      const seeded = {
        id: detail.bookingId,
        parent_id: detail.parentId ?? parentId,
        sitter_id: detail.sitterId ?? null,
        status: "pending"
      } as BookingRow;
      setActiveBooking(seeded);
      activeBookingRef.current = seeded;
      const uid = detail.parentId ?? parentId;
      if (uid) void refreshLiveShiftState(uid);
    };

    const onNewBooking = (event: Event) => {
      applyNewBooking((event as CustomEvent<NewBookingEventDetail>).detail);
    };
    window.addEventListener(ANYNANNY_NEW_BOOKING_EVENT, onNewBooking);

    const pendingMarker = consumeNewBookingMarker();
    if (pendingMarker) applyNewBooking(pendingMarker);

    return () => window.removeEventListener(ANYNANNY_NEW_BOOKING_EVENT, onNewBooking);
  }, [clearToIdleDashboard, parentId, refreshLiveShiftState]);

  useEffect(() => {
    void (async () => {
      const auth = await resolveBrowserAuth();
      if (!auth.ok) return;
      setParentId(auth.userId);
      if (auth.supabase) {
        await refreshParentOnboardingStatus(auth.supabase, auth.userId);
        await refreshLiveShiftState(auth.userId);
        await refreshParentRatingSummary(auth.userId);
      }
    })();
  }, [refreshParentOnboardingStatus, refreshLiveShiftState, refreshParentRatingSummary]);

  useEffect(() => {
    if (!parentId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const bump = () => {
      void refreshLiveShiftState(parentId);
    };

    const handleBookingRealtime = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      bump();

      const next = (payload as { new?: Record<string, unknown> }).new;
      const prev = (payload as { old?: Record<string, unknown> }).old;
      const nextStatus = normalizeStatus(next?.status);
      const prevStatus = normalizeStatus(prev?.status);
      const bookingId = next?.id != null ? String(next.id) : "";

      if (
        payload.eventType === "UPDATE" &&
        nextStatus === "approved" &&
        (prevStatus === "pending" || prevStatus === "" || prevStatus === "requested")
      ) {
        const toastKey = `${bookingId}:approved`;
        if (lastSitterAcceptedToastKeyRef.current !== toastKey) {
          lastSitterAcceptedToastKeyRef.current = toastKey;
          setSitterAcceptedToast("הבייביסיטר אישרה את המשמרת!");
        }
      }
    };

    const bookingsChannel = subscribePostgresChanges(
      supabase,
      `parent-dash-bookings:${parentId}`,
      {
        event: "*",
        table: BOOKINGS_TABLE,
        filter: `parent_id=eq.${parentId}`,
        handler: handleBookingRealtime
      },
      (status) => {
        if (status === "SUBSCRIBED") bump();
      }
    );

    const sessionsChannel = subscribePostgresChanges(
      supabase,
      `parent-dash-sessions:${parentId}`,
      {
        event: "*",
        table: SESSIONS_TABLE,
        filter: `parent_id=eq.${parentId}`,
        handler: (_payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => bump()
      },
      (status) => {
        if (status === "SUBSCRIBED") bump();
      }
    );

    return () => {
      removeRealtimeChannel(supabase, bookingsChannel);
      removeRealtimeChannel(supabase, sessionsChannel);
    };
  }, [parentId, refreshLiveShiftState]);

  useEffect(() => {
    if (!sitterAcceptedToast) return;
    const t = window.setTimeout(() => setSitterAcceptedToast(null), 7000);
    return () => window.clearTimeout(t);
  }, [sitterAcceptedToast]);

  useEffect(() => {
    const id = activeBooking?.id ? String(activeBooking.id) : null;
    const status = normalizeStatus(activeBooking?.status);
    const prev = bookingStatusWatchRef.current;
    if (id && status === "approved" && prev && prev.id === id && prev.status === "pending") {
      const toastKey = `${id}:approved`;
      if (lastSitterAcceptedToastKeyRef.current !== toastKey) {
        lastSitterAcceptedToastKeyRef.current = toastKey;
        setSitterAcceptedToast("הבייביסיטר אישרה את המשמרת!");
      }
    }
    if (id && status) {
      bookingStatusWatchRef.current = { id, status };
    } else if (!id) {
      bookingStatusWatchRef.current = null;
    }
  }, [activeBooking?.id, activeBooking?.status]);

  useEffect(() => {
    if (!parentId) return;
    const locked = settlementLockRef.current != null;
    const awaiting =
      normalizeStatus(activeBooking?.status) === "sitter_ended" ||
      normalizeStatus(activeSession?.status) === "sitter_completed";
    const liveTimer = isActiveSessionRow(activeSession);
    const settling = isSettlementSession(activeSession) || locked;
    const hasShiftUi = Boolean(activeBooking) || liveTimer || awaiting || settling;

    if (!hasShiftUi) return;

    const id = window.setInterval(() => {
      void refreshLiveShiftState(parentId);
    }, POLL_MS);

    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      void refreshLiveShiftState(parentId);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [parentId, activeBooking?.id, activeBooking?.status, activeSession?.status, settlementStep, refreshLiveShiftState]);

  const handleParentConfirmStart = () => {
    if (!activeBooking?.id || !parentId || confirmPending) return;
    if (!isConfirmableBooking(activeBooking.status)) {
      setShiftError("ניתן לאשר הגעה רק לאחר שהבייביסיטר סימנה שהגיעה.");
      return;
    }

    startConfirmTransition(async () => {
      setShiftError(null);
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setShiftError("Supabase לא מוגדר.");
        return;
      }

      const bookingId = String(activeBooking.id);
      const sitterId = String(activeBooking.sitter_id ?? "").trim();
      const startIso = new Date().toISOString();

      const approved = await parentApproveSitterStart(supabase, parentId, bookingId);
      if (!approved.row) {
        setShiftError(
          approved.error ?? "ניתן לאשר הגעה רק לאחר שהבייביסיטר סימנה שהגיעה."
        );
        return;
      }
      setActiveBooking(approved.row);

      if (!sitterId) {
        setShiftError("חסר מזהה בייביסיטר למשמרת.");
        return;
      }

      const activated = await activateParentConfirmedSession(supabase, {
        parentId,
        sitterId,
        bookingId,
        startIso
      });

      if (!activated.row) {
        setShiftError(activated.error ?? "לא ניתן להפעיל את שעון המשמרת.");
        return;
      }

      setActiveSession(activated.row);
      await refreshLiveShiftState(parentId);
    });
  };

  const handleParentConfirmEnd = () => {
    if (!parentId || confirmEndPending) return;
    const bookingId = activeBooking?.id ? String(activeBooking.id) : null;
    if (!bookingId && !activeSession?.id) return;

    lockSettlement("rating");

    startConfirmEndTransition(async () => {
      setShiftError(null);
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setShiftError("Supabase לא מוגדר.");
        clearSettlementLock();
        return;
      }

      if (bookingId) {
        const result = await parentConfirmEndBooking(
          supabase,
          parentId,
          bookingId,
          activeSession?.id ? String(activeSession.id) : null
        );
        if (result.error) {
          setShiftError(result.error);
          clearSettlementLock();
          return;
        }
        if (result.row) {
          setActiveBooking(result.row);
          activeBookingRef.current = result.row;
        }
        if (result.session) {
          setActiveSession(result.session);
          activeSessionRef.current = result.session;
        }
      } else if (activeSession?.id) {
        const now = new Date().toISOString();
        const startMs = activeSession.start_time
          ? new Date(activeSession.start_time).getTime()
          : NaN;
        const elapsedSeconds = Number.isFinite(startMs)
          ? Math.max(0, Math.floor((Date.now() - startMs) / 1000))
          : 0;

        if (currentHourlyRate == null) {
          setShiftError("לא נמצא תעריף תקין למשמרת.");
          clearSettlementLock();
          return;
        }

        const amountNis = Number(((elapsedSeconds / 3600) * currentHourlyRate).toFixed(2));
        const { data, error } = await supabase
          .from(SESSIONS_TABLE)
          .update({
            status: "payment_pending",
            end_time: now,
            final_elapsed_seconds: elapsedSeconds,
            final_amount_nis: amountNis
          })
          .eq("id", activeSession.id)
          .eq("parent_id", parentId)
          .select(
            "id, parent_id, sitter_id, status, start_time, end_time, final_elapsed_seconds, final_amount_nis, parent_end_requested_at"
          )
          .maybeSingle();
        if (error || !data) {
          setShiftError(error?.message ?? "לא ניתן לאשר סיום משמרת.");
          clearSettlementLock();
          return;
        }
        
        const settlementSession = data as SupabaseSessionRow;
        setActiveSession(settlementSession);
        activeSessionRef.current = settlementSession;
      }

      lockSettlement("rating");
    });
  };

  const settlementElapsedSeconds = useMemo(() => {
    if (!activeSession) return 0;
    if (typeof activeSession.final_elapsed_seconds === "number") {
      return Math.max(0, Math.floor(activeSession.final_elapsed_seconds));
    }
    if (!activeSession.start_time) return 0;
    const startMs = new Date(activeSession.start_time).getTime();
    const endMs = activeSession.end_time
      ? new Date(activeSession.end_time).getTime()
      : nowMs;
    return Math.max(0, Math.floor((endMs - startMs) / 1000));
  }, [activeSession, nowMs]);

  const sitterBaseNis = useMemo(() => {
    if (typeof activeSession?.final_amount_nis === "number") {
      return Math.max(0, Number(activeSession.final_amount_nis));
    }
    if (currentHourlyRate == null) {
      return 0;
    }
    return Number(
      (
        (settlementElapsedSeconds / 3600) *
        currentHourlyRate
      ).toFixed(2)
    );
  }, [activeSession?.final_amount_nis, settlementElapsedSeconds, currentHourlyRate]);

  const handleReportManualPayment = useCallback(async () => {
    if (manualPaymentInFlightRef.current || manualPaymentBusy) return;
    if (!activeBooking?.id || !manualPaymentMethod) {
      setShiftError("בחרו אמצעי תשלום ולחצו על שילמתי.");
      return;
    }
    manualPaymentInFlightRef.current = true;
    setManualPaymentBusy(true);
    setShiftError(null);
    try {
      const res = await fetch("/api/parent/report-manual-payment", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: String(activeBooking.id),
          paymentMethod: manualPaymentMethod
        })
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        paymentStatus?: string;
        paymentMethod?: string;
        noop?: boolean;
      };
      if (!res.ok) {
        setShiftError(json.error ?? "לא ניתן לדווח שהתשלום בוצע.");
        return;
      }
      const reportedAt = new Date().toISOString();
      setActiveBooking((prev) =>
        prev && String(prev.id) === String(activeBooking.id)
          ? {
              ...prev,
              payment_status: "awaiting_sitter_confirmation",
              payment_method: manualPaymentMethod,
              payment_rail: "manual",
              parent_reported_paid_at: prev.parent_reported_paid_at ?? reportedAt
            }
          : prev
      );
      if (activeBookingRef.current && String(activeBookingRef.current.id) === String(activeBooking.id)) {
        activeBookingRef.current = {
          ...activeBookingRef.current,
          payment_status: "awaiting_sitter_confirmation",
          payment_method: manualPaymentMethod,
          payment_rail: "manual",
          parent_reported_paid_at:
            activeBookingRef.current.parent_reported_paid_at ?? reportedAt
        };
      }
      lockSettlement("waiting_sitter");
    } catch (e) {
      console.error("[handleReportManualPayment]", e);
      setShiftError("שגיאה בדיווח התשלום. נסו שוב.");
    } finally {
      manualPaymentInFlightRef.current = false;
      setManualPaymentBusy(false);
    }
  }, [activeBooking?.id, lockSettlement, manualPaymentBusy, manualPaymentMethod]);

  const handleSubmitParentRating = useCallback(
    async (rating: number, comment: string | null) => {
      if (!activeSession?.id) return;
      setRatingBusy(true);
      setRatingError(null);
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setRatingError("Supabase לא מוגדר.");
        setRatingBusy(false);
        return;
      }
      const result = await submitSessionRating(supabase, {
        sessionId: String(activeSession.id),
        role: "parent",
        rating,
        comment
      });
      setRatingBusy(false);
      if (!result.ok) {
        setRatingError(result.error);
        return;
      }
      markParentSessionRatedLocally(String(activeSession.id));
      lockSettlement("payment");
    },
    [activeSession?.id, lockSettlement]
  );

  useEffect(() => {
    if (settlementStep !== "payment") return;
    const bookingId = activeBooking?.id ? String(activeBooking.id) : "";
    if (!bookingId) return;
    let cancelled = false;
    setManualPaymentDestinationsLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/parent/manual-payment-destinations?bookingId=${encodeURIComponent(bookingId)}`,
          {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store"
          }
        );
        const json = (await res.json().catch(() => ({}))) as ManualPaymentDestinations & {
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setManualPaymentDestinations({
            bookingId,
            cash: { available: true },
            bit: { available: false },
            paybox: { available: false }
          });
          if (json.error) setShiftError(json.error);
          return;
        }
        setManualPaymentDestinations({
          bookingId: json.bookingId || bookingId,
          cash: { available: true },
          bit: json.bit ?? { available: false },
          paybox: json.paybox ?? { available: false }
        });
      } catch (error) {
        console.warn("[parent-dashboard] manual payment destinations:", error);
        if (!cancelled) {
          setManualPaymentDestinations({
            bookingId,
            cash: { available: true },
            bit: { available: false },
            paybox: { available: false }
          });
        }
      } finally {
        if (!cancelled) setManualPaymentDestinationsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settlementStep, activeBooking?.id]);

  useEffect(() => {
    if (!manualPaymentMethod || !manualPaymentDestinations) return;
    if (manualPaymentMethod === "bit" && !manualPaymentDestinations.bit.available) {
      setManualPaymentMethod(null);
    }
    if (manualPaymentMethod === "paybox" && !manualPaymentDestinations.paybox.available) {
      setManualPaymentMethod(null);
    }
  }, [manualPaymentDestinations, manualPaymentMethod]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (checkout !== "success" && checkout !== "cancel") return;

    const cleanUrl = () => {
      const url = new URL(window.location.href);
      for (const key of [
        "checkout",
        "paid",
        "bookingId",
        PARENT_PAYMENT_BOOKING_QUERY_PARAM,
        "shiftSessionId",
        "sessionId",
        "gateway",
        "Id",
        "Amount",
        "CCode",
        "Info",
        "MoreData",
        "Order",
        "Sign",
        "ACode",
        "Bank",
        "Payments",
        "UserId",
        "Brand",
        "Issuer",
        "L4digit",
        "Fild1",
        "Fild2",
        "Fild3"
      ]) {
        url.searchParams.delete(key);
      }
      window.history.replaceState({}, "", url.pathname + url.search);
    };

    if (checkout === "cancel") {
      setShiftError("התשלום בוטל. ניתן לנסות שוב.");
      lockSettlement("payment");
      cleanUrl();
      return;
    }

    let cancelled = false;
    void (async () => {
      const hyp = parseHypReturnParams(params);
      const pending = readHypPendingCheckout();
      const alreadyPaidFlag = params.get("paid") === "1";

      if (hyp.cCode != null && String(hyp.cCode).trim() !== "" && !hyp.isSuccess) {
        if (!cancelled) {
          setShiftError(`התשלום לא אושר ב-HYP (CCode=${hyp.cCode}).`);
          lockSettlement("payment");
        }
        cleanUrl();
        return;
      }

      const bookingId =
        hyp.bookingId ||
        pending?.bookingId ||
        activeBookingRef.current?.id ||
        null;
      const sessionId =
        hyp.sessionId ||
        pending?.sessionId ||
        activeSessionRef.current?.id ||
        null;

      if (!bookingId) {
        setShiftError("התשלום חזר בהצלחה אך חסר מזהה הזמנה לסגירה.");
        cleanUrl();
        return;
      }

      if (!alreadyPaidFlag) {
        const result = await finalizeHypCheckoutFromClient({
          search: window.location.search,
          bookingId: String(bookingId),
          sessionId: sessionId ? String(sessionId) : undefined,
          cCode: hyp.cCode
        });
        if (!result.ok) {
          if (!cancelled) {
            setShiftError(result.error ?? "לא ניתן לסגור את התשלום אחרי HYP.");
          }
          cleanUrl();
          return;
        }
      }

      clearHypPendingCheckout();
      if (sessionId) clearParentSessionRatedLocally(String(sessionId));
      clearToIdleDashboard();
      if (parentId) await refreshLiveShiftState(parentId);
      cleanUrl();
    })();

    return () => {
      cancelled = true;
    };
  }, [parentId, refreshLiveShiftState, lockSettlement, clearToIdleDashboard]);

  const awaitingEndApproval = isAwaitingEndApproval(activeBooking, activeSession);
  const inSettlement =
    (settlementStep === "rating" ||
      settlementStep === "payment" ||
      settlementStep === "waiting_sitter" ||
      settlementStep === "dispute" ||
      settlementStep === "waiting_sitter_rating" ||
      isSettlementSession(activeSession)) &&
    !["pending", "approved", "rejected", "sitter_started", "parent_started"].includes(
      normalizeStatus(activeBooking?.status)
    );
  const dueForActiveShiftUi = Boolean(
    hasHydrated &&
      activeBooking &&
      isBookingDueForParentActiveShiftUi(activeBooking) &&
      !isMissedShiftLifecycleStatus(activeBooking.status)
  );
  const clarificationBooking =
    missedShiftBooking && missedShiftRequiresViewerAction(missedShiftBooking, "parent")
      ? missedShiftBooking
      : null;
  const showMissedShiftClarification = Boolean(hasHydrated && clarificationBooking);
  const scheduledBookingId = activeBooking?.id ? String(activeBooking.id) : null;
  const isStickyApprovedNotification = Boolean(
    scheduledBookingId && stickyApprovedNotificationId === scheduledBookingId
  );
  const isScheduledConfirmed = Boolean(
    hasHydrated &&
      activeBooking &&
      isFutureConfirmedScheduleBooking(activeBooking) &&
      (isStickyApprovedNotification ||
        shouldShowApprovedScheduleNotification(activeBooking, dismissedApprovedBookingIds))
  );
  const isScheduledPending = Boolean(
    hasHydrated &&
      activeBooking &&
      isFutureScheduledBooking(activeBooking) &&
      !isFutureConfirmedScheduleBooking(activeBooking)
  );
  const isRejectedBooking = shouldShowRejectedNotification(
    activeBooking,
    dismissedRejectedBookingIds
  );
  const showLiveTimer =
    dueForActiveShiftUi &&
    isLiveTimerBooking(activeBooking?.status) &&
    isActiveSessionRow(activeSession) &&
    !awaitingEndApproval &&
    !inSettlement;
  const bookingStatus = normalizeStatus(activeBooking?.status);
  const scheduledLabel =
    activeBooking?.booking_date && activeBooking?.start_time && activeBooking?.end_time
      ? formatBookingSchedule(activeBooking)
      : null;

  const liveElapsedSeconds = useMemo(() => {
    const row = activeSession;
    if (!row?.start_time) return 0;
    if (!showLiveTimer && !awaitingEndApproval) return 0;
    const startMs = new Date(row.start_time).getTime();
    const parentEndMs = row.parent_end_requested_at
      ? new Date(row.parent_end_requested_at).getTime()
      : awaitingEndApproval
        ? nowMs
        : null;
    return computeLiveElapsedSecondsActive({
      startMs,
      parentEndRequestedAtMs: parentEndMs,
      nowMs
    });
  }, [
    activeSession,
    awaitingEndApproval,
    nowMs,
    showLiveTimer
  ]);

  const liveTimerText = useMemo(() => formatElapsed(liveElapsedSeconds), [liveElapsedSeconds]);
  const liveEarned = useMemo(() => {
    if (currentHourlyRate == null) return "0.00";
    return computeLiveAccruedNis(liveElapsedSeconds, currentHourlyRate);
  }, [liveElapsedSeconds, currentHourlyRate]);

  const handleOnboardingSaved = async () => {
    window.location.reload();
  };

  const onboardingPending = profileCardStatus === "incomplete";
  const firstName = prefs.parentName ? prefs.parentName.trim().split(" ")[0] : "הורה";
  const parentSerialLabel = parentDashboardSerialLabel(parentSerial);
  const showLiveShiftCard =
    (dueForActiveShiftUi && Boolean(activeBooking)) ||
    showLiveTimer ||
    awaitingEndApproval ||
    inSettlement ||
    isRejectedBooking ||
    showMissedShiftClarification;
  const showStuckShiftReleaseButton =
    Boolean(activeBooking?.id) &&
    !inSettlement &&
    !bookingRequiresAdminReview(activeBooking) &&
    (hasConfirmedDoubleShakeStart(activeSession) ||
      showLiveTimer ||
      awaitingEndApproval);
  const showScheduledCard = isScheduledConfirmed || isScheduledPending;
  const showShiftCard = showLiveShiftCard || showScheduledCard;
  const statusCardKey = clarificationBooking?.id
    ? `missed:${String(clarificationBooking.id)}`
    : activeBooking?.id
    ? `${String(activeBooking.id)}:${bookingStatus || "none"}`
    : inSettlement
      ? `settlement:${settlementStep ?? "open"}`
      : null;
  const rejectedBookingId = isRejectedBooking && activeBooking?.id ? String(activeBooking.id) : null;

  useEffect(() => {
    if (!isRejectedBooking || !rejectedBookingId) return;
    const sitterId = String(activeBooking?.sitter_id ?? "").trim();
    if (!sitterId) return;
    if (capturedRejectedBookingIdRef.current === rejectedBookingId) return;

    capturedRejectedBookingIdRef.current = rejectedBookingId;
    const placeholder = {
      id: sitterId,
      name: "בייביסיטר",
      avatarUrl: null,
      rating: null
    };
    // Preserve the original dashboard copy: heading + bookings.rejection_note.
    const originalHeading = "הבקשה נדחתה על ידי הבייביסיטר";
    const originalPoliteNote = String(activeBooking?.rejection_note ?? "").trim();
    setRejectedDeclineNotice({
      message: originalHeading,
      secondary: originalPoliteNote,
      sitter: placeholder
    });

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;
    void (async () => {
      const snapshot = await fetchRejectedSitterSnapshot(supabase, sitterId);
      if (cancelled) return;
      if (capturedRejectedBookingIdRef.current !== rejectedBookingId) return;
      setRejectedDeclineNotice((prev) =>
        prev ? { ...prev, sitter: snapshot } : prev
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [isRejectedBooking, rejectedBookingId, activeBooking?.sitter_id]);

  useEffect(() => {
    if (!isScheduledConfirmed || !scheduledBookingId) return;
    const uid = String(parentId ?? activeBooking?.parent_id ?? "").trim();
    if (!uid) return;

    stickyApprovedNotificationIdRef.current = scheduledBookingId;
    setStickyApprovedNotificationId((prev) =>
      prev === scheduledBookingId ? prev : scheduledBookingId
    );

    if (acknowledgedApprovedIdsRef.current.has(scheduledBookingId)) return;
    if (activeBooking?.parent_notified_at) {
      acknowledgedApprovedIdsRef.current.add(scheduledBookingId);
      persistDismissedApprovedBookingId(uid, scheduledBookingId);
      return;
    }

    acknowledgedApprovedIdsRef.current.add(scheduledBookingId);
    persistDismissedApprovedBookingId(uid, scheduledBookingId);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      void acknowledgeApprovedBookingNotification(supabase, uid, scheduledBookingId);
    }
  }, [
    isScheduledConfirmed,
    scheduledBookingId,
    parentId,
    activeBooking?.parent_id,
    activeBooking?.parent_notified_at
  ]);

  const scheduledBannerDismissed = Boolean(
    hasHydrated &&
      scheduledBookingId &&
      isScheduledPending &&
      dismissedScheduledBookingIds.has(scheduledBookingId)
  );
  const rejectedBannerDismissed = Boolean(
    hasHydrated &&
      rejectedBookingId &&
      dismissedRejectedBookingIds.has(rejectedBookingId)
  );

  const statusCardVisible =
    hasHydrated &&
    showShiftCard &&
    !scheduledBannerDismissed &&
    !rejectedBannerDismissed &&
    (!statusCardKey || dismissedStatusKey !== statusCardKey) &&
    !rejectedDeclineNotice;

  // Expanded Active Shift panel: free vertical space by hiding shortcuts / external actions.
  const isActiveShiftExpanded = statusCardVisible && !statusCardCollapsed;
  const shouldHideDashboardActions = isActiveShiftExpanded;

  const dismissStatusBanner = () => {
    if (clarificationBooking?.id) {
      dismissedMissedShiftIdsRef.current.add(String(clarificationBooking.id));
      setMissedShiftBooking(null);
    }
    if (scheduledBookingId && isScheduledConfirmed) {
      const uid = String(parentId ?? activeBooking?.parent_id ?? "").trim();
      const acknowledgedAt = new Date().toISOString();
      if (uid) {
        persistDismissedApprovedBookingId(uid, scheduledBookingId);
        setDismissedApprovedBookingIds((prev) => {
          const next = new Set(prev);
          next.add(scheduledBookingId);
          dismissedApprovedBookingIdsRef.current = next;
          return next;
        });
        acknowledgedApprovedIdsRef.current.add(scheduledBookingId);
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          void acknowledgeApprovedBookingNotification(supabase, uid, scheduledBookingId);
        }
      }
      stickyApprovedNotificationIdRef.current = null;
      setStickyApprovedNotificationId(null);
      setActiveBooking((prev) =>
        prev?.id === scheduledBookingId
          ? { ...prev, parent_notified_at: prev.parent_notified_at ?? acknowledgedAt }
          : prev
      );
    }
    if (scheduledBookingId && isScheduledPending) {
      persistDismissedScheduledBookingId(scheduledBookingId);
      setDismissedScheduledBookingIds((prev) => {
        const next = new Set(prev);
        next.add(scheduledBookingId);
        return next;
      });
    }
    if (rejectedBookingId && isRejectedBooking) {
      const uid = String(parentId ?? activeBooking?.parent_id ?? "").trim();
      if (!uid) return;

      const acknowledgedAt = new Date().toISOString();
      persistDismissedRejectedBookingId(uid, rejectedBookingId);
      setDismissedRejectedBookingIds((prev) => {
        const next = new Set(prev);
        next.add(rejectedBookingId);
        dismissedRejectedBookingIdsRef.current = next;
        return next;
      });
      setActiveBooking((prev) =>
        prev?.id === rejectedBookingId
          ? { ...prev, parent_notified_at: acknowledgedAt }
          : prev
      );

      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        void acknowledgeRejectedBookingNotification(supabase, uid, rejectedBookingId);
      }
    }
    if (statusCardKey) setDismissedStatusKey(statusCardKey);
    setStatusCardCollapsed(false);
  };

  const closeRejectedDeclineNotice = () => {
    dismissStatusBanner();
    setRejectedDeclineNotice(null);
    capturedRejectedBookingIdRef.current = "";
  };

  const statusCollapsedSummary = isRejectedBooking
    ? "הבקשה נדחתה — לחצו להרחבה"
    : inSettlement
      ? settlementStep === "waiting_sitter"
        ? "ממתין לאישור הנני — לחצו להרחבה"
        : settlementStep === "dispute"
          ? "בירור תשלום — לחצו להרחבה"
          : settlementStep === "waiting_sitter_rating"
            ? "ממתין לדירוג הנני — לחצו להרחבה"
            : settlementStep === "payment"
              ? "תשלום ממתין — לחצו להרחבה"
              : "דירוג ממתין — לחצו להרחבה"
      : awaitingEndApproval
        ? "ממתין לאישור סיום משמרת"
        : showLiveTimer
          ? `משמרת פעילה · ${liveTimerText}`
          : isScheduledConfirmed
            ? "המשמרת נקבעה — לחצו להרחבה"
            : isScheduledPending
              ? "בקשה עתידית ממתינה — לחצו להרחבה"
              : showMissedShiftClarification
                ? "המשמרת לא התקיימה"
                : isWaitingForSitterArrival(activeBooking)
                ? "ממתינים להגעת הבייביסיטר"
                : "סטטוס משמרת — לחצו להרחבה";

  const statusCardTone = isRejectedBooking
    ? "rose"
    : awaitingEndApproval ||
        (inSettlement && (settlementStep === "payment" || settlementStep === "dispute"))
      ? "rose"
      : showMissedShiftClarification
        ? "rose"
        : isScheduledPending || isWaitingForSitterArrival(activeBooking)
        ? "amber"
        : "emerald";

  useEffect(() => {
    setStatusCardCollapsed(false);
  }, [statusCardKey]);

  return (
    <main className="relative mx-auto w-full min-w-0 max-w-md space-y-4" dir="rtl">
      {rejectedDeclineNotice ? (
        <DeclineNoticeUnit
          notice={rejectedDeclineNotice}
          onClose={closeRejectedDeclineNotice}
        />
      ) : null}
      {onboardingPending ? (
        <div className="fixed inset-x-0 bottom-0 top-20 z-50 flex items-start justify-center overflow-y-auto px-4 py-8 bg-[#FDFBF6]/95 backdrop-blur-sm">
          <div className="w-full max-w-sm my-auto">
            <ParentOnboardingWizard onSaved={handleOnboardingSaved} />
          </div>
        </div>
      ) : null}

      <div className={`space-y-4 ${onboardingPending ? "filter blur-[3px] pointer-events-none select-none opacity-50" : ""}`}>
        <div className="w-full min-w-0 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm">
                  {parentAvatarUrl ? (
                    <img
                      src={parentAvatarUrl}
                      alt="תמונת פרופיל"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-400">
                      <User className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <h1 className="text-lg font-bold text-slate-900">שלום, {firstName}!</h1>
              </div>
              {parentSerialLabel ? (
                <span
                  className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 text-[13px] font-bold px-2.5 py-0.5 rounded-md border border-purple-200"
                  dir="ltr"
                >
                  <span>{parentSerialLabel}</span>
                  <span className="text-[11px] text-purple-500 font-normal">ID</span>
                </span>
              ) : null}
            </div>

            <div className="flex items-center justify-start">
              <div className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200/60 text-amber-800 text-xs font-medium px-2 py-0.5 rounded-md">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                <span>
                  {parentRatingSummary.average.toFixed(1)}
                </span>
                <span className="text-slate-400 text-[13px]">
                  ({parentRatingSummary.count}{" "}
                  {parentRatingSummary.count === 1
                    ? "חוות דעת"
                    : "חוות דעת"})
                </span>
              </div>
            </div>

            <IdentityStatusIndicator
              userId={parentId}
              role="parent"
              nextPath="/parent/dashboard"
            />

            {sitterAcceptedToast ? (
              <div
                role="status"
                aria-live="polite"
                className="flex flex-row-reverse items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-right text-xs font-semibold text-emerald-900 shadow-sm"
              >
                <button
                  type="button"
                  aria-label="סגור"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-emerald-800/70 transition hover:bg-emerald-100 hover:text-emerald-950"
                  onClick={() => setSitterAcceptedToast(null)}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
                <div className="flex min-w-0 flex-1 flex-row-reverse items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  <p className="min-w-0 flex-1 leading-snug">{sitterAcceptedToast}</p>
                </div>
              </div>
            ) : null}

            {stuckShiftReviewNotice ? (
              <div
                role="status"
                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-right text-xs text-amber-950"
              >
                <p className="font-bold">{STUCK_SHIFT_REVIEW_LABEL}</p>
                <p className="mt-1 leading-snug">{STUCK_SHIFT_REVIEW_SUPPORT}</p>
              </div>
            ) : null}

        </div>

            {!shouldHideDashboardActions ? (
              <div className="grid min-w-0 grid-cols-3 gap-2.5">
                <Link
                  href="/parent/calendar"
                  onClick={dismissStatusBanner}
                  aria-label={
                    cancellationAttention.showDot
                      ? "יומן תיאום המשמרות — יש עדכון ביטול"
                      : pendingSitterApprovalCount > 0
                      ? `יומן תיאום המשמרות — ${pendingSitterApprovalCount} ממתינות לאישור בייביסיטר`
                      : "יומן תיאום המשמרות"
                  }
                  className="group flex min-h-[6.5rem] min-w-0 flex-col items-end justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 text-right shadow-sm transition hover:bg-slate-50 hover:shadow-md active:scale-[0.98]"
                >
                  <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-600/10">
                    <Calendar className="h-6 w-6 stroke-[1.75]" aria-hidden />
                    <CancellationAttentionDot visible={cancellationAttention.showDot} />
                    {pendingSitterApprovalCount > 0 ? (
                      <span
                        className="absolute right-0 top-0 flex h-4 min-w-4 -translate-y-0.5 translate-x-0.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[12px] font-bold leading-none text-white ring-2 ring-white"
                        aria-hidden
                      >
                        {pendingSitterApprovalCount > 9 ? "9+" : pendingSitterApprovalCount}
                      </span>
                    ) : null}
                  </span>
                  <span className="w-full text-right text-xs font-semibold leading-snug text-slate-800 sm:text-sm">
                    יומן תיאום המשמרות
                  </span>
                </Link>
                <Link
                  href="/parent/wallet"
                  className="group flex min-h-[6.5rem] min-w-0 flex-col items-end justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 text-right shadow-sm transition hover:bg-slate-50 hover:shadow-md active:scale-[0.98]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-600/10">
                    <Wallet className="h-6 w-6 stroke-[1.75]" aria-hidden />
                  </span>
                  <span className="w-full text-right text-xs font-semibold leading-snug text-slate-800 sm:text-sm">
                    הארנק שלי
                  </span>
                </Link>
                <Link
                  href="/parent/history"
                  className="group flex min-h-[6.5rem] min-w-0 flex-col items-end justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 text-right shadow-sm transition hover:bg-slate-50 hover:shadow-md active:scale-[0.98]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-navy-header/10">
                    <History className="h-6 w-6 stroke-[1.75] text-[#001F3F]" aria-hidden />
                  </span>
                  <span className="w-full text-right text-xs font-semibold leading-snug text-slate-800 sm:text-sm">
                    היסטוריית משמרות
                  </span>
                </Link>
              </div>
            ) : null}

          {statusCardVisible ? (
            <DashboardStatusCard
              collapsedSummary={statusCollapsedSummary}
              collapsed={statusCardCollapsed}
              onToggleCollapse={() => setStatusCardCollapsed((v) => !v)}
              onDismiss={dismissStatusBanner}
              tone={statusCardTone}
            >
              {shiftError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {shiftError}
                </p>
              ) : null}

              {showMissedShiftClarification && clarificationBooking ? (
                <MissedShiftClarificationCard
                  booking={clarificationBooking}
                  role="parent"
                  onSubmitted={(next) => {
                    dismissedMissedShiftIdsRef.current.add(String(next.id));
                    setMissedShiftBooking(null);
                    setActiveBooking((prev) => (prev?.id === next.id ? null : prev));
                  }}
                />
              ) : isRejectedBooking ? (
                <div className="flex w-full flex-col items-start gap-2">
                  <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    <p className="font-semibold text-rose-800">
                      הבקשה נדחתה על ידי הבייביסיטר
                    </p>
                    {activeBooking?.rejection_note ? (
                      <p className="mt-1">{activeBooking.rejection_note}</p>
                    ) : null}
                  </div>
                </div>
              ) : inSettlement && settlementStep === "waiting_sitter" ? (
                <div className="flex w-full flex-col items-center gap-2 text-center">
                  <p className="text-sm font-bold text-emerald-900">
                    {AWAITING_SITTER_CONFIRMATION_HEADING}
                  </p>
                  <p className="text-xs leading-relaxed text-emerald-800/85">
                    {AWAITING_SITTER_CONFIRMATION_COPY}
                  </p>
                </div>
              ) : inSettlement && settlementStep === "dispute" ? (
                <div className="flex w-full flex-col items-center gap-2 text-center">
                  <p className="text-sm font-bold text-rose-900">{PAYMENT_DISPUTE_HEADING}</p>
                  <p className="text-xs leading-relaxed text-rose-800/85">
                    {PARENT_PAYMENT_DISPUTE_BLOCKS_NEW_BOOKING_MESSAGE}
                  </p>
                </div>
              ) : inSettlement && settlementStep === "waiting_sitter_rating" ? (
                <div className="flex w-full flex-col items-center gap-2 text-center">
                  <p className="text-sm font-bold text-emerald-900">
                    {AWAITING_SITTER_RATING_HEADING}
                  </p>
                </div>
              ) : inSettlement && settlementStep === "payment" ? (
                <div className="flex w-full flex-col items-stretch gap-3">
                  <ManualPaymentPanel
                    elapsedSeconds={settlementElapsedSeconds}
                    sitterBaseNis={sitterBaseNis}
                    destinations={manualPaymentDestinations}
                    destinationsLoading={manualPaymentDestinationsLoading}
                    selectedMethod={manualPaymentMethod}
                    onSelectMethod={setManualPaymentMethod}
                    busy={manualPaymentBusy}
                    bookingReady={Boolean(activeBooking?.id)}
                    errorMessage={shiftError}
                    onReportPaid={() => void handleReportManualPayment()}
                  />
                </div>
              ) : inSettlement ? (
                <div className="flex w-full flex-col items-center gap-3">
                  <p className="text-sm font-bold text-emerald-900">דרגו את הבייביסיטר לפני התשלום</p>
                  <ParentSessionRatingPanel
                    sitterName="הבייביסיטר"
                    busy={ratingBusy}
                    errorMessage={ratingError}
                    onSubmitRating={handleSubmitParentRating}
                  />
                </div>
              ) : awaitingEndApproval ? (
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sm font-bold text-rose-900">
                    הבייביסיטר ביקש/ה לסיים את המשמרת
                  </p>
                  <p className="text-xs text-rose-800/80">
                    אשרו סיום כדי לעבור לדירוג ואז לתשלום מאובטח.
                  </p>
                  {settlementElapsedSeconds > 0 ? (
                    <p className="text-xs font-medium text-slate-600">
                      זמן שנצבר: {formatElapsed(settlementElapsedSeconds)} · ₪{sitterBaseNis.toFixed(2)}
                    </p>
                  ) : null}
                  <DoubleShakeCircleButton
                    label={confirmEndPending ? "מאשר סיום…" : "אשר סיום משמרת"}
                    variant="salmon"
                    busy={confirmEndPending}
                    onClick={handleParentConfirmEnd}
                  />
                </div>
              ) : showLiveTimer ? (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-sm font-bold text-emerald-900">המשמרת פעילה עכשיו</p>
                  <ParentSessionTimerCircle
                    timerText={liveTimerText}
                    amountLabel={`₪${liveEarned}`}
                  />
                  <p className="text-[13px] font-medium text-emerald-800/80">
                    סכום שנצבר: ₪{liveEarned} · ₪{currentHourlyRate ?? "--"}/שעה
                  </p>
                </div>
              ) : dueForActiveShiftUi &&
                activeBooking &&
                isConfirmableBooking(activeBooking.status) ? (
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sm font-bold text-emerald-900">
                    הבייביסיטר הגיעה — אשר/י הגעה להתחלת השעון
                  </p>
                  <DoubleShakeCircleButton
                    label={confirmPending ? "מאשר הגעה…" : "אשר הגעת נני"}
                    variant="emerald"
                    busy={confirmPending}
                    onClick={handleParentConfirmStart}
                  />
                </div>
              ) : isWaitingForSitterArrival(activeBooking) ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    <Clock className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-bold text-amber-900">ממתינים להגעת הבייביסיטר</p>
                  <p className="text-xs text-amber-800/80">
                    אישור ההתחלה יופיע רק אחרי שהבייביסיטר תלחץ &quot;הגעתי&quot;.
                  </p>
                </div>
              ) : isScheduledConfirmed ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-bold text-emerald-900">המשמרת נקבעה בהצלחה</p>
                  <p className="text-xs text-emerald-800/80">
                    ההזמנה אושרה על ידי הבייביסיטר ותופיע ביומן שלך.
                  </p>
                  {scheduledLabel ? (
                    <p className="text-xs font-semibold text-emerald-900">{scheduledLabel}</p>
                  ) : null}
                  <Link
                    href="/parent/calendar"
                    onClick={dismissStatusBanner}
                    className="mt-1 text-xs font-bold text-emerald-700 underline underline-offset-2"
                  >
                    מעבר ליומן
                  </Link>
                </div>
              ) : isScheduledPending ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    <Clock className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-bold text-amber-900">בקשה עתידית ממתינה לאישור</p>
                  {scheduledLabel ? (
                    <p className="text-xs font-medium text-amber-900/80">{scheduledLabel}</p>
                  ) : null}
                  {scheduledBookingId ? (
                    <PendingWithdrawButton
                      bookingId={scheduledBookingId}
                      onSuccess={() => handlePendingWithdrawn(scheduledBookingId)}
                      onError={setShiftError}
                    />
                  ) : null}
                  <Link
                    href="/parent/calendar"
                    onClick={dismissStatusBanner}
                    className="mt-1 text-xs font-bold text-amber-800 underline underline-offset-2"
                  >
                    מעבר ליומן
                  </Link>
                </div>
              ) : dueForActiveShiftUi &&
                activeBooking &&
                isLiveTimerBooking(activeBooking.status) ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-bold text-emerald-900">המשמרת אומתה ואושרה!</p>
                  <p className="text-xs text-emerald-800/70">
                    ממתין לסנכרון שעון החיוב… הטיימר יופיע כאן אוטומטית כשהמשמרת פעילה.
                  </p>
                </div>
              ) : dueForActiveShiftUi && activeBooking ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    <Clock className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-bold text-amber-900">בקשה נשלחה וממתינה לאישור</p>
                  {bookingStatus ? (
                    <p className="text-[13px] text-amber-800/70">סטטוס: {bookingStatus}</p>
                  ) : null}
                  {activeBooking?.id && bookingStatus === "pending" ? (
                    <PendingWithdrawButton
                      bookingId={String(activeBooking.id)}
                      onSuccess={() => handlePendingWithdrawn(String(activeBooking.id))}
                      onError={setShiftError}
                    />
                  ) : null}
                </div>
              ) : null}
            </DashboardStatusCard>
          ) : null}

          {!shouldHideDashboardActions ? (
            <>
              <div className="space-y-2 pt-1">
                <Link
                  href="/parent/search"
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-[#001F3F] py-3 px-2 text-xs font-bold text-white shadow-md transition hover:bg-[#001F3F]/90"
                >
                  <Search className="h-4 w-4" />
                  חיפוש נני
                </Link>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                {showStuckShiftReleaseButton ? (
                  <button
                    type="button"
                    disabled={releasingStuckShift}
                    onClick={handleOpenReleaseStuckShiftModal}
                    className="w-full rounded-xl border border-amber-300 bg-amber-50/50 py-2.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 shadow-2xs disabled:opacity-60"
                  >
                    {releasingStuckShift ? "משחרר…" : "שחרור משמרת תקועה"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    const supabase = getSupabaseBrowserClient();
                    setBroadcastMinimized(false);
                    if (supabase) void supabase.auth.signOut().then(() => (window.location.href = "/login"));
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50/30 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 shadow-2xs"
                >
                  <LogOut className="h-4 w-4" />
                  התנתקות
                </button>
              </div>
            </>
          ) : null}
      </div>
      <ReleaseStuckShiftModal
        open={releaseStuckModalOpen}
        busy={releasingStuckShift}
        error={releaseStuckModalError}
        onClose={handleCloseReleaseStuckShiftModal}
        onConfirm={(reasonId, detail) => void handleConfirmReleaseStuckShift(reasonId, detail)}
      />
      <CancellationAttentionModals attention={cancellationAttention} role="parent" />
      <PendingNoResponseReminderModal
        parentId={parentId}
        onWithdrawn={handlePendingWithdrawn}
      />
    </main>
  );
}