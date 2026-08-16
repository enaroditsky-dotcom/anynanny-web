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
import { PaymentFactory } from "@/components/billing/PaymentFactory";
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
import { useParentPendingBookingCount } from "@/lib/bookings/use-parent-pending-booking-count";
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
import { resetStuckShiftsForParent } from "@/lib/bookings/parent-reset-stuck-shifts";
import type { CheckoutPaymentMethod } from "@/lib/billing/checkout-payment-method";
import { parseHypReturnParams } from "@/lib/billing/hyp/parse-return-params";
import {
  clearHypPendingCheckout,
  readHypPendingCheckout,
  saveHypPendingCheckout
} from "@/lib/billing/hyp/pending-checkout";
import { finalizeHypCheckoutFromClient } from "@/lib/billing/hyp/finalize-client";
import {
  parentTotalFromSitterBaseNis,
  usePaymentExecutor
} from "@/lib/billing/use-payment-executor";
import type { ParentPaymentMethod } from "@/lib/wallet/parent-payment-methods";
import { readParentPreferredCheckoutMethod } from "@/lib/wallet/parent-preferred-checkout-method";
import type { ParentBusySlot, ParentPreferences } from "@/lib/parent/types";
import { fetchProfilePublicId } from "@/lib/public/sequential-display-id";
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
  "id, parent_id, sitter_id, status, booking_date, start_time, end_time, rejection_note, hourly_rate_nis, parent_notified_at, created_at, updated_at";

/** Fallback when `parent_notified_at` is not yet migrated. */
const BOOKING_LIVE_SELECT_LEGACY =
  "id, parent_id, sitter_id, status, booking_date, start_time, end_time, rejection_note, hourly_rate_nis, created_at, updated_at";

const LIVE_BOOKING_FETCH_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "sitter_started",
  "parent_started",
  "sitter_ended"
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

type SettlementStep = "payment" | "rating";

type ParentCheckoutPaymentMethodUi =
  | "credit_card"
  | "bit"
  | "apple_pay"
  | "google_pay";

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
  const paymentStatus = normalizeStatus(
    (b as BookingRow & { payment_status?: string }).payment_status
  );
  const paidAt = (b as BookingRow & { paid_at?: string | null }).paid_at;
  return normalizeStatus(b.status) === "completed" && paymentStatus !== "paid" && !paidAt;
}

function pickParentDashboardBooking(
  rows: BookingRow[],
  opts?: {
    preferBookingId?: string | null;
    settlementLocked?: boolean;
    dismissedRejectedIds?: Set<string>;
  }
): BookingRow | null {
  if (!rows.length) return null;

  const preferId = opts?.preferBookingId
    ? String(opts.preferBookingId)
    : null;
  const dismissedRejectedIds = opts?.dismissedRejectedIds ?? new Set<string>();

  const pendingRejectedNotification = (b: BookingRow) =>
    shouldShowRejectedNotification(b, dismissedRejectedIds);

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
    (b) => isBookingDueForParentActiveShiftUi(b)
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
      (
        isBookingDueForParentActiveShiftUi(preferred) ||
        isUnpaidCompletedBooking(preferred) ||
        pendingRejectedNotification(preferred)
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

  const futureConfirmed = rows.find(
    (b) => isFutureConfirmedScheduleBooking(b)
  );

  if (futureConfirmed) {
    return futureConfirmed;
  }

  const futurePending = rows.find(
    (b) => isFutureScheduledBooking(b)
  );

  if (futurePending) {
    return futurePending;
  }

  const fallbackRow = rows.find(
    (b) => !isRejectedWithNoteBooking(b) || pendingRejectedNotification(b)
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
  const { executePayment, busy: paymentBusy, error: paymentError, clearError: clearPaymentError } =
    usePaymentExecutor();
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
  const [parentRatingSummary, setParentRatingSummary] = useState<UserRatingSummary>({
    average: 0,
    count: 0
  });
  const [hasHydrated, setHasHydrated] = useState(false);
  const [parentId, setParentId] = useState<string | null>(
    initialActiveBooking?.parent_id ? String(initialActiveBooking.parent_id) : null
  );
  const pendingSitterApprovalCount = useParentPendingBookingCount(parentId, Boolean(parentId));
  const [profileCardStatus] = useState<"loading" | "complete" | "incomplete">("complete");
  const [activeBooking, setActiveBooking] = useState<BookingRow | null>(
    (initialActiveBooking as BookingRow | null | undefined) ?? null
  );
  const [activeSession, setActiveSession] = useState<SupabaseSessionRow | null>(null);
  const [shiftError, setShiftError] = useState<string | null>(null);
  const [confirmPending, startConfirmTransition] = useTransition();
  const [confirmEndPending, startConfirmEndTransition] = useTransition();
  const [settlementStep, setSettlementStep] = useState<SettlementStep | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<ParentCheckoutPaymentMethodUi>(
    "credit_card"
  );
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<ParentPaymentMethod[]>([]);
  const [savedPaymentMethodsLoading, setSavedPaymentMethodsLoading] = useState(false);
  const [selectedSavedMethodId, setSelectedSavedMethodId] = useState<string | null>(null);
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
      return;
    }
    const dismissed = readDismissedRejectedBookingIds(parentId);
    setDismissedRejectedBookingIds(dismissed);
    dismissedRejectedBookingIdsRef.current = dismissed;
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

        const localSessionId = activeSessionRef.current?.id
          ? String(activeSessionRef.current.id)
          : null;

        const recoverSettlementStepIfUnlocked = async (
          session: SupabaseSessionRow | null | undefined
        ) => {
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

        // Always re-read parent-scoped dismissals from localStorage so login/refresh
        // cannot resurface a booking the parent already dismissed with X.
        const dismissedRejectedIds = readDismissedRejectedBookingIds(uid);
        dismissedRejectedBookingIdsRef.current = dismissedRejectedIds;
        setDismissedRejectedBookingIds(dismissedRejectedIds);

        const booking = pickParentDashboardBooking(bookingRows, {
          preferBookingId: activeBookingRef.current?.id ?? null,
          settlementLocked: settlementIsLocked(),
          dismissedRejectedIds
        });
        const bookingSitterId =
          booking?.sitter_id != null ? String(booking.sitter_id) : null;
        const bookingStatus = normalizeStatus(booking?.status);
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

        const settlementSession = await fetchLatestParentSessionRow(supabase, uid, {
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
            await recoverSettlementStepIfUnlocked(next);
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
            await recoverSettlementStepIfUnlocked(next);
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

  const handleReleaseStuckShift = useCallback(async () => {
    if (releasingStuckShift) return;
    if (!window.confirm("לשחרר משמרת תקועה ולנקות את מצב ההמתנה?")) return;

    setReleasingStuckShift(true);
    setShiftError(null);
    clearToIdleDashboard();
    clearHypPendingCheckout();
    clearPaymentError();

    try {
      const auth = await resolveBrowserAuth();
      if (auth.ok) {
        await resetStuckShiftsForParent(auth.supabase, auth.userId);
        await refreshLiveShiftState(auth.userId).catch(() => undefined);
        clearToIdleDashboard();
      }
    } catch (err) {
      console.warn("[parent-dashboard] release stuck shift", err);
      clearToIdleDashboard();
    } finally {
      setReleasingStuckShift(false);
    }
  }, [
    releasingStuckShift,
    clearToIdleDashboard,
    clearPaymentError,
    refreshLiveShiftState
  ]);

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

  const paymentSplit = useMemo(
    () => parentTotalFromSitterBaseNis(sitterBaseNis),
    [sitterBaseNis]
  );

  const handlePayShift = useCallback(async () => {
    if (!activeBooking?.id || !activeSession?.id) {
      setShiftError("חסרים פרטי משמרת לתשלום.");
      return;
    }
    clearPaymentError();
    setShiftError(null);
    try {
      if (paymentMethod === "apple_pay" || paymentMethod === "google_pay") {
        setShiftError(
          "Apple Pay / Google Pay מוצגים ל-UI בלבד בשלב 1. הטמעת החיוב בפועל תתבצע ב-Phase 2."
        );
        return;
      }

      const backendPaymentMethod: CheckoutPaymentMethod =
        paymentMethod === "bit" ? "bit" : "credit_card";

      const result = await executePayment({
        bookingId: String(activeBooking.id),
        sessionId: String(activeSession.id),
        sitterBaseNis,
        paymentMethod: backendPaymentMethod,
        paymentMethodId: selectedSavedMethodId,
        elapsedSeconds: settlementElapsedSeconds
      });
      if (!result.success) {
        setShiftError(result.error);
        return;
      }
      if (result.paidImmediately) {
        clearHypPendingCheckout();
        setShiftError(null);
        window.location.assign("/parent/dashboard?paid=1");
        return;
      }
      const checkoutUrl = String(result.checkoutUrl ?? "").trim();
      if (!checkoutUrl) {
        setShiftError("לא התקבל קישור לתשלום מ-HYP. נסו שוב.");
        return;
      }
      // Persist booking/session before leaving so /parent/checkout/complete can recover them.
      // Do NOT mark paid here — finalization requires a real successful HYP CCode on return.
      saveHypPendingCheckout({
        bookingId: String(activeBooking.id),
        sessionId: String(activeSession.id)
      });
      window.location.assign(checkoutUrl);
    } catch (e) {
      console.error("[handlePayShift]", e);
      setShiftError("שגיאה בעיבוד התשלום. נסו שוב.");
    }
  }, [
    activeBooking?.id,
    activeSession?.id,
    clearPaymentError,
    executePayment,
    paymentMethod,
    selectedSavedMethodId,
    settlementElapsedSeconds,
    sitterBaseNis
  ]);

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
    let cancelled = false;
    setSavedPaymentMethodsLoading(true);
    void (async () => {
      try {
        const preferred = parentId ? readParentPreferredCheckoutMethod(parentId) : null;
        if (!cancelled && preferred) {
          setPaymentMethod(preferred);
        }

        const res = await fetch("/api/parent/payment-methods", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store"
        });
        const json = (await res.json().catch(() => ({}))) as {
          methods?: ParentPaymentMethod[];
        };
        if (cancelled) return;
        const methods = Array.isArray(json.methods) ? json.methods : [];
        setSavedPaymentMethods(methods);
        const defaultMethod = methods.find((m) => m.is_default) ?? methods[0] ?? null;
        /*
         * Hosted rails (Bit / Apple Pay / Google Pay) must not auto-select a saved
         * card alongside them, or checkout will charge / open the card UI instead
         * of the chosen wallet rail.
         */
        if (preferred === "bit" || preferred === "apple_pay" || preferred === "google_pay") {
          setSelectedSavedMethodId(null);
        } else {
          setSelectedSavedMethodId(defaultMethod?.id ?? null);
          if (!preferred && defaultMethod) setPaymentMethod("credit_card");
        }
      } catch (error) {
        console.warn("[parent-dashboard] saved payment methods:", error);
        if (!cancelled) setSavedPaymentMethods([]);
      } finally {
        if (!cancelled) setSavedPaymentMethodsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settlementStep, parentId]);

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
          search: params,
          bookingId: String(bookingId),
          sessionId: sessionId ? String(sessionId) : undefined,
          hypApprovalId: hyp.approvalId ?? params.get("Id"),
          amountPaid: hyp.amount ?? params.get("Amount"),
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
      isSettlementSession(activeSession)) &&
    !["pending", "approved", "rejected", "sitter_started", "parent_started"].includes(
      normalizeStatus(activeBooking?.status)
    );
  const dueForActiveShiftUi = Boolean(
    hasHydrated && activeBooking && isBookingDueForParentActiveShiftUi(activeBooking)
  );
  const isScheduledConfirmed = Boolean(
    hasHydrated && activeBooking && isFutureConfirmedScheduleBooking(activeBooking)
  );
  const isScheduledPending = Boolean(
    hasHydrated &&
      activeBooking &&
      isFutureScheduledBooking(activeBooking) &&
      !isScheduledConfirmed
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
  const showLiveShiftCard =
    (dueForActiveShiftUi && Boolean(activeBooking)) ||
    showLiveTimer ||
    awaitingEndApproval ||
    inSettlement ||
    isRejectedBooking;
  /**
   * Stuck-shift recovery is only for a genuine in-flight shift/session.
   * Do not show it for rejected/pending-only cards (e.g. cancelled Broadcast
   * leftovers or a rejected Broadcast request) — those are not stuck shifts.
   */
  const showStuckShiftReleaseButton =
    showLiveTimer ||
    awaitingEndApproval ||
    inSettlement ||
    (dueForActiveShiftUi &&
      Boolean(activeBooking) &&
      (bookingStatus === "approved" ||
        bookingStatus === "sitter_started" ||
        bookingStatus === "parent_started" ||
        bookingStatus === "sitter_ended"));
  const showScheduledCard = isScheduledConfirmed || isScheduledPending;
  const showShiftCard = showLiveShiftCard || showScheduledCard;
  const statusCardKey = activeBooking?.id
    ? `${String(activeBooking.id)}:${bookingStatus || "none"}`
    : inSettlement
      ? `settlement:${settlementStep ?? "open"}`
      : null;
  const scheduledBookingId = activeBooking?.id ? String(activeBooking.id) : null;
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

  const scheduledBannerDismissed = Boolean(
    hasHydrated &&
      scheduledBookingId &&
      (isScheduledConfirmed || isScheduledPending) &&
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
    if (scheduledBookingId && (isScheduledConfirmed || isScheduledPending)) {
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
      ? settlementStep === "payment"
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
              : isWaitingForSitterArrival(activeBooking)
                ? "ממתינים להגעת הבייביסיטר"
                : "סטטוס משמרת — לחצו להרחבה";

  const statusCardTone = isRejectedBooking
    ? "rose"
    : awaitingEndApproval || (inSettlement && settlementStep === "payment")
      ? "rose"
      : isScheduledPending || isWaitingForSitterArrival(activeBooking)
        ? "amber"
        : "emerald";

  useEffect(() => {
    setStatusCardCollapsed(false);
  }, [statusCardKey]);

  return (
    <main className="relative mx-auto max-w-md space-y-4 p-4 pb-[calc(8rem+var(--anynanny-now-dock,0px))] overflow-y-auto min-h-screen" dir="rtl">
      {rejectedDeclineNotice ? (
        <DeclineNoticeUnit
          notice={rejectedDeclineNotice}
          onClose={closeRejectedDeclineNotice}
        />
      ) : null}
      {onboardingPending ? (
        <div className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-8 bg-[#FDFBF6]/95 backdrop-blur-sm">
          <div className="w-full max-w-sm my-auto">
            <ParentOnboardingWizard onSaved={handleOnboardingSaved} />
          </div>
        </div>
      ) : null}

      <div className={`space-y-4 ${onboardingPending ? "filter blur-[3px] pointer-events-none select-none opacity-50" : ""}`}>
        <div className="mx-auto max-w-sm rounded-3xl bg-white p-5 shadow-sm border border-slate-200/80 space-y-4">
          <div className="rounded-2xl bg-slate-50/70 p-4 border border-slate-100 space-y-3">
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
              <span
                className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 text-[11px] font-bold px-2.5 py-0.5 rounded-md border border-purple-200"
                dir="ltr"
              >
                <span>{parentSerial}</span>
                <span className="text-[9px] text-purple-500 font-normal">ID</span>
              </span>
            </div>

            <div className="flex items-center justify-start">
              <div className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200/60 text-amber-800 text-xs font-medium px-2 py-0.5 rounded-md">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                <span>
                  {parentRatingSummary.average.toFixed(1)}
                </span>
                <span className="text-slate-400 text-[11px]">
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

            {!shouldHideDashboardActions ? (
              <div className="grid grid-cols-3 gap-2 pt-1">
                <Link
                  href="/parent/calendar"
                  onClick={dismissStatusBanner}
                  aria-label={
                    pendingSitterApprovalCount > 0
                      ? `יומן תיאום המשמרות — ${pendingSitterApprovalCount} ממתינות לאישור בייביסיטר`
                      : "יומן תיאום המשמרות"
                  }
                  className="flex min-h-[5.25rem] flex-col items-center justify-center gap-1 rounded-2xl border border-slate-200/80 bg-white px-1.5 py-3 text-center shadow-2xs transition hover:bg-slate-50"
                >
                  <span className="relative inline-flex">
                    <Calendar className="h-5 w-5 shrink-0 text-emerald-600" />
                    {pendingSitterApprovalCount > 0 ? (
                      <span
                        className="absolute right-0 top-0 flex h-4 min-w-4 -translate-y-1.5 translate-x-1.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white"
                        aria-hidden
                      >
                        {pendingSitterApprovalCount > 9 ? "9+" : pendingSitterApprovalCount}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[11px] font-semibold leading-snug text-slate-800 sm:text-xs">
                    יומן תיאום המשמרות
                  </span>
                </Link>
                <Link
                  href="/parent/wallet"
                  className="flex min-h-[5.25rem] flex-col items-center justify-center gap-1 rounded-2xl border border-slate-200/80 bg-white px-1.5 py-3 text-center shadow-2xs transition hover:bg-slate-50"
                >
                  <Wallet className="h-5 w-5 shrink-0 text-emerald-600" />
                  <span className="text-[11px] font-semibold leading-snug text-slate-800 sm:text-xs">
                    הארנק שלי
                  </span>
                </Link>
                <Link
                  href="/parent/history"
                  className="flex min-h-[5.25rem] flex-col items-center justify-center gap-1 rounded-2xl border border-slate-200/80 bg-white px-1.5 py-3 text-center shadow-2xs transition hover:bg-slate-50"
                >
                  <History className="h-5 w-5 shrink-0 text-[#001F3F]" />
                  <span className="text-[11px] font-semibold leading-snug text-slate-800 sm:text-xs">
                    היסטוריית משמרות
                  </span>
                </Link>
              </div>
            ) : null}
          </div>

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

              {isRejectedBooking ? (
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
              ) : inSettlement && settlementStep !== "payment" ? (
                <div className="flex w-full flex-col items-center gap-3">
                  <p className="text-sm font-bold text-emerald-900">דרגו את הבייביסיטר לפני התשלום</p>
                  <ParentSessionRatingPanel
                    sitterName="הבייביסיטר"
                    busy={ratingBusy}
                    errorMessage={ratingError}
                    onSubmitRating={handleSubmitParentRating}
                  />
                </div>
              ) : inSettlement && settlementStep === "payment" ? (
                <div className="flex w-full flex-col items-stretch gap-3">
                  <PaymentFactory
                    elapsedSeconds={settlementElapsedSeconds}
                    sitterBaseNis={paymentSplit.sitterBaseNis}
                    parentTotalNis={paymentSplit.totalNis}
                    platformFeeNis={paymentSplit.platformFeeNis}
                    selectedMethod={paymentMethod}
                    onSelectMethod={setPaymentMethod}
                    savedMethods={savedPaymentMethods}
                    selectedSavedMethodId={selectedSavedMethodId}
                    onSelectSavedMethod={setSelectedSavedMethodId}
                    savedMethodsLoading={savedPaymentMethodsLoading}
                    busy={paymentBusy}
                    bookingReady={Boolean(activeBooking?.id && activeSession?.id)}
                    errorMessage={paymentError ?? shiftError}
                    onConfirm={() => void handlePayShift()}
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
                  <p className="text-[11px] font-medium text-emerald-800/80">
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
                    <p className="text-[11px] text-amber-800/70">סטטוס: {bookingStatus}</p>
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
                    onClick={() => void handleReleaseStuckShift()}
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
      </div>

    </main>
  );
}