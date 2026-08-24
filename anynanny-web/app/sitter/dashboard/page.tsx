"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Calendar, History, Wallet, X } from "lucide-react";
import { DashboardStatusCard } from "@/components/dashboard/dashboard-status-card";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDashboardGreetingName } from "@/lib/user/use-dashboard-greeting-name";
import { SitterMandatoryRatingPanel } from "@/components/session/sitter-mandatory-rating-panel";
import { ReleaseStuckShiftModal } from "@/components/parent/release-stuck-shift-modal";
import { SitterOnboardingWizard } from "@/components/sitter/sitter-onboarding-wizard";
import { SitterDashboardHeader } from "@/components/sitter/sitter-dashboard-header";
import { SitterBroadcastAlertModal } from "@/components/sitter/SitterBroadcastAlertModal"; 
import { LogoutButton } from "@/components/account/logout-button";
import { fetchProfilePublicId } from "@/lib/public/sequential-display-id";
import { hasSitterCompletedOnboarding, SITTER_PROFILES_TABLE, SITTER_PROFILES_USER_COLUMN } from "@/lib/sitter/sitter-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";
import { SESSIONS_TABLE, SESSION_PENDING_START_STATUSES, computeLiveAccruedNis, computeLiveElapsedSecondsActive, resolveLiveHourlyRateNis, type SupabaseSessionRow, formatElapsed } from "@/lib/session/protocol";
import { dismissCompletedSession, readDismissedCompletedSessionId, shouldSuppressStaleCompletedSession } from "@/lib/session/dismissed-completed";
import { readSessionLinkedBookingId, SESSION_SELECT_FALLBACK_CHAIN, SESSIONS_PROTOCOL_SELECT_CORE } from "@/lib/session/sessions-query";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
import { safeSupabaseRead } from "@/lib/supabase/safe-supabase-read";
import { persistShiftLocallyDismissed } from "@/lib/session/dismissed-shift-lock";
import { DoubleShakeCircleButton, DoubleShakeCircleSlot, DoubleShakeShiftPanel } from "@/components/session/double-shake-circle-button";
import { BOOKINGS_TABLE, SITTER_FORCE_END_SUCCESS_MESSAGE } from "@/lib/bookings/constants";
import { SitterDoubleShakeIdleCircle } from "@/components/session/sitter-double-shake-idle-circle";
import { SitterShiftApprovalCard } from "@/components/sitter/sitter-shift-approval-card";
import {
  ANYNANNY_NEW_BOOKING_EVENT,
  bookingAllowsSettlementClosureUi,
  isFreshLiveBookingStatus
} from "@/lib/bookings/new-booking-reset";
import { doesBookingBlockSessionShiftUi, SHIFT_ACTIVATION_LEAD_MS } from "@/lib/bookings/booking-shift-ui";
import { isSitterBookingAwaitingApprovalStatus, isSitterShiftCircleStatus } from "@/lib/bookings/booking-realtime-handler";
import { bookingLiveSyncKey } from "@/lib/bookings/booking-live-key";
import { fetchTodayBookingShiftGate, fetchTodaysPendingBookingRequest, fetchStuckShiftReviewLinks, type TodaysLinkedBookingView } from "@/lib/bookings/todays-linked-booking";
import { bookingRequiresAdminReview, hasConfirmedDoubleShakeStart, sessionLinkedToReviewBooking, STUCK_SHIFT_REVIEW_LABEL, STUCK_SHIFT_REVIEW_SUPPORT } from "@/lib/bookings/stuck-shift-review";
import {
  RELEASE_STUCK_SHIFT_COPY,
  SITTER_RELEASE_STUCK_SHIFT_WARNING,
  markDisplayedStuckShiftForReview,
  resolveDisplayedStuckShiftTargets,
  type ReleaseStuckShiftReasonId
} from "@/lib/bookings/release-displayed-stuck-shift";
import { buildShiftWindowMs, normalizeBookingStatus } from "@/lib/bookings/use-shift-activation-status";
import { useTodaysLinkedBooking, type TodaysLinkedBookingSyncPayload } from "@/lib/bookings/use-todays-linked-booking";
import { sitterCompleteSession } from "@/lib/session/sitter-complete-session";
import { sitterMarkBookingEnded } from "@/lib/bookings/sitter-mark-booking-ended";
import { friendlySupabaseSessionError } from "@/lib/session/supabase-errors";
import { submitSessionRating } from "@/lib/ratings/submit-session-rating";
import {
  markSitterSessionRatedLocally,
  sitterHasRatedSession
} from "@/lib/ratings/sitter-session-rated";
import { useSitterPendingBookingCount } from "@/lib/bookings/use-sitter-pending-booking-count";
import { useCancellationAttention } from "@/lib/bookings/use-cancellation-attention";
import { CancellationAttentionDot } from "@/components/bookings/cancellation-attention-dot";
import { CancellationAttentionModals } from "@/components/bookings/cancellation-attention-modals";
import { useSession } from "@/context/SessionContext";

const SITTER_ROLE = "sitter" as const;

const SITTER_TERMINAL_SESSION_STATUSES = ["completed", "sitter_completed", "payment_pending", "paid"];

type SitterSessionQueryResult = { data: unknown; error: unknown };

async function selectSitterSessionRows(
  build: (select: string) => PromiseLike<SitterSessionQueryResult>
): Promise<{ data: SupabaseSessionRow[]; error: string | null }> {
  let lastError: string | null = null;
  for (const select of [...SESSION_SELECT_FALLBACK_CHAIN, SESSIONS_PROTOCOL_SELECT_CORE]) {
    const result = await build(select);
    const read = safeSupabaseRead(
      result as { data: SupabaseSessionRow[] | null; error: import("@supabase/supabase-js").PostgrestError | null },
      "sitter dashboard sessions"
    );
    if (!read.error) {
      return { data: (read.data as SupabaseSessionRow[] | null) ?? [], error: null };
    }
    lastError = read.error;
    if (
      read.schemaDrift ||
      isPostgrestMissingColumnError(read.error, "start_confirmed") ||
      isPostgrestMissingColumnError(read.error, "parent_end_requested_at") ||
      isPostgrestMissingColumnError(read.error, "sitter_end_confirmed_at") ||
      /column|schema cache|could not find/i.test(String(read.error))
    ) {
      continue;
    }
    break;
  }
  return { data: [], error: lastError };
}

async function selectSitterSessionMaybeSingle(
  build: (select: string) => PromiseLike<SitterSessionQueryResult>
): Promise<{ data: SupabaseSessionRow | null; error: string | null }> {
  let lastError: string | null = null;
  for (const select of SESSION_SELECT_FALLBACK_CHAIN) {
    const result = await build(select);
    const read = safeSupabaseRead(
      result as { data: SupabaseSessionRow | null; error: import("@supabase/supabase-js").PostgrestError | null },
      "sitter dashboard session"
    );
    if (!read.error) {
      return { data: (read.data as SupabaseSessionRow | null) ?? null, error: null };
    }
    lastError = read.error;
    if (
      read.schemaDrift ||
      isPostgrestMissingColumnError(read.error, "start_confirmed") ||
      isPostgrestMissingColumnError(read.error, "parent_end_requested_at") ||
      /column|schema cache|could not find/i.test(String(read.error))
    ) {
      continue;
    }
    break;
  }
  return { data: null, error: lastError };
}

function sitterSessionStatusKey(row: SupabaseSessionRow | null | undefined): string {
  return String(row?.status ?? "").toLowerCase();
}

function parentRequestedEndAt(row: SupabaseSessionRow): boolean {
  return row.parent_end_requested_at != null && String(row.parent_end_requested_at).length > 0;
}

function rowMatchesEndConfirm(row: SupabaseSessionRow, sitterId: string): boolean {
  return (
    row.status === "active" &&
    parentRequestedEndAt(row) &&
    row.sitter_end_confirmed_at == null &&
    row.sitter_id === sitterId
  );
}

export default function SitterDashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { nowMs, sitter: sessionSitter } = useSession();

  const {
    sitterId, setSitterId, pendingRow, setPendingRow, activeShiftRow, setActiveShiftRow, 
    endConfirmRow, setEndConfirmRow, completedSummaryRow, setCompletedSummaryRow,
    bootstrapComplete: sitterBootstrapComplete, setBootstrapComplete: setSitterBootstrapComplete,
    bookingCache: sitterBookingCache, patchBookingCache: patchSitterBookingCache,
    circleBooking, applyCircleBooking, syncFromPayload, syncFromLinkedBooking,
    suppressCompletedSummaryIdRef
  } = sessionSitter;

  const [sitterClosureBusy, setSitterClosureBusy] = useState(false);
  const [sitterClosureError, setSitterClosureError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !sitterBootstrapComplete);
  const [banner, setBanner] = useState<string | null>(null);
  const [bookingRealtimeToast, setBookingRealtimeToast] = useState<string | null>(null);
  const [bookingRealtimeToastTone, setBookingRealtimeToastTone] = useState<"emerald" | "amber" | "rose">("amber");
  const [statusPanelCollapsed, setStatusPanelCollapsed] = useState(false);
  const [statusPanelDismissedKey, setStatusPanelDismissedKey] = useState<string | null>(null);
  const [forceEndToast, setForceEndToast] = useState<string | null>(null);
  const [endShiftBusy, setEndShiftBusy] = useState(false);
  const [profileCardStatus, setProfileCardStatus] = useState<"loading" | "complete" | "incomplete">("loading");
  const [sitterAvatarUrl, setSitterAvatarUrl] = useState<string | null>(null);
  const [dashboardStatsRefreshKey, setDashboardStatsRefreshKey] = useState(0);
  const [sitterPublicDisplayId, setSitterPublicDisplayId] = useState<string | null>(null);
  const [sitterSerialLoaded, setSitterSerialLoaded] = useState(false);
  const [pendingApprovalBooking, setPendingApprovalBooking] = useState<TodaysLinkedBookingView | null>(null);
  const [stuckShiftReviewNotice, setStuckShiftReviewNotice] = useState(false);
  const [releaseStuckModalOpen, setReleaseStuckModalOpen] = useState(false);
  const [releasingStuckShift, setReleasingStuckShift] = useState(false);
  const [releaseStuckModalError, setReleaseStuckModalError] = useState<string | null>(null);
  const [checkingAuthEnforcement, setCheckingAuthEnforcement] = useState(true);
  const lastBookingToastKeyRef = useRef<string | null>(null);
  const lastRealtimeToastAtRef = useRef<number>(0);

  const handleBookingLiveSync = useCallback((payload: TodaysLinkedBookingSyncPayload) => {
    syncFromPayload(payload);
    if (payload.booking) { syncFromLinkedBooking(payload.booking); }

    if (payload.source !== "realtime") return;
    if (!payload.liveFieldsChanged) return;
    const row = payload.row ?? payload.booking;
    const bookingId = row?.id ? String(row.id) : null;
    const status = row?.status ? normalizeBookingStatus(row.status as any) : undefined;
    if (!bookingId || !status) return;

    const toastKey = `${bookingId}:${status}`;
    if (lastBookingToastKeyRef.current === toastKey) return;
    lastBookingToastKeyRef.current = toastKey;

    const now = Date.now();
    if (now - lastRealtimeToastAtRef.current < 1200) return;

    if (status === "pending") {
      setBookingRealtimeToast("התקבלה בקשה חדשה — נוספה לרשימה למעלה");
      setBookingRealtimeToastTone("amber");
      lastRealtimeToastAtRef.current = now;
      return;
    }

    if (status === "approved") {
      setBookingRealtimeToast("הבקשה אושרה — תתעדכן כאן מיד");
      setBookingRealtimeToastTone("emerald");
      lastRealtimeToastAtRef.current = now;
      return;
    }

    if (status === "rejected" || status === "cancelled") {
      setBookingRealtimeToast("הבקשה עודכנה — תתעדכן כאן מיד");
      setBookingRealtimeToastTone("rose");
      lastRealtimeToastAtRef.current = now;
      return;
    }
  }, [syncFromPayload, syncFromLinkedBooking]);

  useEffect(() => {
    if (!bookingRealtimeToast) return;
    const t = window.setTimeout(() => setBookingRealtimeToast(null), 6500);
    return () => window.clearTimeout(t);
  }, [bookingRealtimeToast]);

  const { firstName, nameLoading: greetingNameLoading } = useDashboardGreetingName("sitter", sitterId, dashboardStatsRefreshKey);

  const { booking: todaysBookingHook, shiftGate: todayBookingShiftGateHook, ready: bookingGuardReadyHook, reload: reloadTodaysBooking } = useTodaysLinkedBooking("sitter", sitterId, { onBookingSync: handleBookingLiveSync });

  useEffect(() => {
    patchSitterBookingCache({ booking: todaysBookingHook, shiftGate: todayBookingShiftGateHook, ready: bookingGuardReadyHook });
  }, [todaysBookingHook, todayBookingShiftGateHook, bookingGuardReadyHook, patchSitterBookingCache]);

  const bookingGuardReady = bookingGuardReadyHook || sitterBookingCache.ready;
  const todaysBooking = bookingGuardReadyHook
    ? todaysBookingHook
    : (todaysBookingHook ?? sitterBookingCache.booking);
  const todayBookingShiftGate = bookingGuardReadyHook
    ? todayBookingShiftGateHook
    : (todayBookingShiftGateHook ?? sitterBookingCache.shiftGate);

  useEffect(() => {
    if (!todaysBooking) return;
    syncFromLinkedBooking(todaysBooking);
  }, [todaysBooking, syncFromLinkedBooking]);

  const sessionUiBlockedByBooking = useMemo(
    () => bookingGuardReady && doesBookingBlockSessionShiftUi(todayBookingShiftGate),
    [bookingGuardReady, todayBookingShiftGate]
  );
  const showSitterBookingApproval =
    bookingGuardReady &&
    !sessionUiBlockedByBooking &&
    (isSitterBookingAwaitingApprovalStatus(todayBookingShiftGate?.status ?? null) ||
      isSitterBookingAwaitingApprovalStatus(todaysBooking?.status ?? null));

  useEffect(() => {
    if (todaysBooking && isSitterBookingAwaitingApprovalStatus(todaysBooking.status)) {
      setPendingApprovalBooking(todaysBooking);
      return;
    }

    if (!sitterId || !bookingGuardReady || !showSitterBookingApproval) {
      setPendingApprovalBooking(null);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let cancelled = false;
    void fetchTodaysPendingBookingRequest(supabase, sitterId, "sitter").then(({ booking }) => {
      if (cancelled) return;
      setPendingApprovalBooking(
        booking && isSitterBookingAwaitingApprovalStatus(booking.status) ? booking : null
      );
    });
    return () => {
      cancelled = true;
    };
  }, [
    sitterId,
    bookingGuardReady,
    showSitterBookingApproval,
    todaysBooking,
    todayBookingShiftGate?.id,
    todayBookingShiftGate?.status
  ]);

  const activeCircleBooking = showSitterBookingApproval ? null : (todaysBooking ?? circleBooking);
  const sitterCircleLiveKey = useMemo(() => bookingLiveSyncKey(activeCircleBooking), [activeCircleBooking?.id, activeCircleBooking?.status, activeCircleBooking?.updated_at, todaysBooking?.id, todaysBooking?.status, todaysBooking?.updated_at]);

  const resolveShiftBookingId = useCallback((): string | null => {
    return todaysBooking?.id ?? activeCircleBooking?.id ?? circleBooking?.id ?? null;
  }, [todaysBooking?.id, activeCircleBooking?.id, circleBooking?.id]);

  const lockShiftForToday = useCallback(() => {
    const bookingId = resolveShiftBookingId();
    if (bookingId) persistShiftLocallyDismissed(bookingId);
    applyCircleBooking(null);
  }, [resolveShiftBookingId, applyCircleBooking]);

  useEffect(() => {
    if (!forceEndToast) return;
    const t = window.setTimeout(() => setForceEndToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [forceEndToast]);

  const handleForceEndSuccess = useCallback(async () => {
    lockShiftForToday();
    setBanner(null);
    setForceEndToast(SITTER_FORCE_END_SUCCESS_MESSAGE);
    await reloadTodaysBooking();
    setDashboardStatsRefreshKey((k) => k + 1);
  }, [reloadTodaysBooking, lockShiftForToday]);

  const refreshForUser = useCallback(async (supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>, uid: string) => {
    const [pendRes, actRes, completedRes] = await Promise.all([
      selectSitterSessionRows((select) =>
        supabase
          .from(SESSIONS_TABLE)
          .select(select)
          .or(`sitter_id.is.null,sitter_id.eq.${uid}`)
          .order("created_at", { ascending: false })
          .limit(50)
      ),
      selectSitterSessionRows((select) =>
        supabase
          .from(SESSIONS_TABLE)
          .select(select)
          .eq("status", "active")
          .eq("sitter_id", uid)
          .order("created_at", { ascending: false })
          .limit(20)
      ),
      selectSitterSessionMaybeSingle((select) =>
        supabase
          .from(SESSIONS_TABLE)
          .select(select)
          .in("status", SITTER_TERMINAL_SESSION_STATUSES)
          .eq("sitter_id", uid)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      )
    ]);

    const pendingStatuses = new Set(SESSION_PENDING_START_STATUSES);
    const pendList = pendRes.data.filter((row) => pendingStatuses.has(String(row.status)));
    const actList = actRes.data;

    const reviewLinks = await fetchStuckShiftReviewLinks(supabase, uid, "sitter");
    setStuckShiftReviewNotice(reviewLinks.length > 0);
    const isReviewSession = (row: SupabaseSessionRow | null | undefined) =>
      sessionLinkedToReviewBooking(row, reviewLinks);

    const pending = pendList.find((row) => !isReviewSession(row)) ?? null;
    let endConfirm: SupabaseSessionRow | null = null;
    let activeOnly: SupabaseSessionRow | null = null;

    for (const row of actList) {
      if (isReviewSession(row)) continue;
      if (rowMatchesEndConfirm(row, uid)) {
        endConfirm = row;
        break;
      }
    }
    for (const row of actList) {
      if (isReviewSession(row)) continue;
      if (row.status === "active" && row.sitter_id === uid && !parentRequestedEndAt(row)) {
        activeOnly = row;
        break;
      }
    }

    const gate = await fetchTodayBookingShiftGate(supabase, uid, "sitter");
    const bookingBlocksUi = doesBookingBlockSessionShiftUi(gate);
    const hasBookingRow = Boolean(gate?.id);
    const gateStatus = normalizeBookingStatus(gate?.status) ?? "";

    if (!hasBookingRow) {
      setPendingRow(null);
      setEndConfirmRow(null);
      setActiveShiftRow(null);
      setCompletedSummaryRow(null);
      setPendingApprovalBooking(null);
      applyCircleBooking(null);
      return;
    }

    const dismissedId = readDismissedCompletedSessionId("sitter");
    let completedShow: SupabaseSessionRow | null = null;
    if (!completedRes.error && completedRes.data) {
      const c = completedRes.data as SupabaseSessionRow & { sitter_rating?: number | null };
      const cid = String(c.id);
      if (
        suppressCompletedSummaryIdRef.current === cid ||
        (dismissedId != null && cid === dismissedId) ||
        c.sitter_rating != null
      ) {
        completedShow = null;
      } else {
        completedShow = c;
      }
    }

    // READ-ONLY suppress: never re-prompt after a ratings row exists for this sitter/session.
    if (completedShow?.id) {
      const alreadyRated = await sitterHasRatedSession(supabase, String(completedShow.id), uid);
      if (alreadyRated) {
        completedShow = null;
      }
    }

    if (completedShow && isReviewSession(completedShow)) {
      completedShow = null;
    }

    // Pair terminal session to today's settlement booking — do not resurface an old paid twin.
    if (completedShow && gate) {
      const sessionParent =
        completedShow.parent_id != null ? String(completedShow.parent_id).trim() : "";
      const gateParent = gate.parent_id != null ? String(gate.parent_id).trim() : "";
      if (sessionParent && gateParent && sessionParent !== gateParent) {
        completedShow = null;
      } else {
        const linkedBookingId = readSessionLinkedBookingId(completedShow);
        if (linkedBookingId && gate.id && linkedBookingId !== String(gate.id)) {
          completedShow = null;
        }
      }
    }

    const terminalStatus = sitterSessionStatusKey(completedShow);
    const isProcessingClosure =
      terminalStatus === "sitter_completed" ||
      terminalStatus === "completed" ||
      terminalStatus === "paid" ||
      terminalStatus === "payment_pending";

    if (gateStatus === "rejected" || gateStatus === "cancelled") {
      completedShow = null;
    }

    if (completedShow && !bookingAllowsSettlementClosureUi(gateStatus)) {
      completedShow = null;
    }

    if (
      completedShow &&
      shouldSuppressStaleCompletedSession({
        completedRow: completedShow,
        bookingStatus: gate?.status ?? null,
        hasInFlightSession: Boolean(pending || endConfirm || activeOnly)
      })
    ) {
      if (isFreshLiveBookingStatus(gateStatus)) {
        completedShow = null;
      }
    }

    if (bookingBlocksUi || (isProcessingClosure && completedShow)) {
      setPendingRow(null);
      setEndConfirmRow(null);
      setActiveShiftRow(null);
    } else {
      setPendingRow(pending);
      setEndConfirmRow(endConfirm);
      setActiveShiftRow(activeOnly);
    }

    if (isProcessingClosure && completedShow) {
      if (gateStatus === "completed" && terminalStatus === "completed") {
        completedShow = null;
      }
    } else if (
      gateStatus === "completed" ||
      gateStatus === "rejected" ||
      gateStatus === "cancelled"
    ) {
      if (!isProcessingClosure || terminalStatus === "completed") {
        completedShow = null;
      }
    }
    setCompletedSummaryRow(completedShow);
  }, [
    applyCircleBooking,
    setPendingRow,
    setEndConfirmRow,
    setActiveShiftRow,
    setCompletedSummaryRow,
    suppressCompletedSummaryIdRef
  ]);

  const refreshSitterProfileCardStatus = useCallback(
    async (
      supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
      uid: string
    ) => {
      const [{ data: sitterProfile, error: sitterError }, { data: mainProfile, error: profileError }] =
        await Promise.all([
          supabase
            .from(SITTER_PROFILES_TABLE)
            .select("onboarding_completed_at")
            .eq(SITTER_PROFILES_USER_COLUMN, uid)
            .maybeSingle(),

          supabase
            .from("profiles")
            .select("avatar_url")
            .eq("id", uid)
            .maybeSingle()
        ]);

      if (sitterError || profileError) {
        setProfileCardStatus("incomplete");
        return;
      }

      setSitterAvatarUrl(mainProfile?.avatar_url ?? null);
      setProfileCardStatus(
        hasSitterCompletedOnboarding(sitterProfile ?? {})
          ? "complete"
          : "incomplete"
      );
    },
    []
  );

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setLoading(false); setCheckingAuthEnforcement(false); setBanner("Supabase לא מוגדר."); return; }
    let cancelled = false;
    void (async () => {
      const auth = await resolveBrowserAuth();
      if (!auth.ok) {
        if (!cancelled) { setLoading(false); setCheckingAuthEnforcement(false); setBanner(auth.reason === "no_client" ? "Supabase לא מוגדר." : "יש להתחבר כדי לראות משמרות."); }
        return;
      }
      setSitterId(auth.userId);

      const [{ data: sitterProfile }, { data: mainProfile }] = await Promise.all([
        auth.supabase
          .from(SITTER_PROFILES_TABLE)
          .select("onboarding_completed_at")
          .eq(SITTER_PROFILES_USER_COLUMN, auth.userId)
          .maybeSingle(),

        auth.supabase
          .from("profiles")
          .select("avatar_url")
          .eq("id", auth.userId)
          .maybeSingle()
      ]);

      if (cancelled) return;

      setSitterAvatarUrl(mainProfile?.avatar_url ?? null);
      const onboardingDone = hasSitterCompletedOnboarding(sitterProfile ?? {});
      setProfileCardStatus(onboardingDone ? "complete" : "incomplete");

      await refreshForUser(auth.supabase, auth.userId);
      if (cancelled) return;
      setLoading(false); setSitterBootstrapComplete(true); setCheckingAuthEnforcement(false);
    })();
    return () => { cancelled = true; };
  }, [refreshForUser, setSitterBootstrapComplete, setSitterId]);

  useEffect(() => {
    if (!sitterId) { setSitterSerialLoaded(false); setSitterPublicDisplayId(null); return; }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let cancelled = false;
    setSitterSerialLoaded(false);
    void (async () => {
      const { publicId } = await fetchProfilePublicId(supabase, sitterId, SITTER_ROLE);
      if (cancelled) return;
      setSitterPublicDisplayId(publicId);
      setSitterSerialLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [sitterId]);

  const reloadTodaysBookingRef = useRef(reloadTodaysBooking);
  const refreshForUserRef = useRef(refreshForUser);
  const lastNotificationReloadRef = useRef<number>(0);
  reloadTodaysBookingRef.current = reloadTodaysBooking;
  refreshForUserRef.current = refreshForUser;

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !sitterId || loading || checkingAuthEnforcement) return;

    let statsRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshSitterLiveState = () => {
      void reloadTodaysBookingRef.current();
      void refreshForUserRef.current(supabase, sitterId);
      if (statsRefreshTimer) clearTimeout(statsRefreshTimer);
      statsRefreshTimer = setTimeout(() => {
        setDashboardStatsRefreshKey((k) => k + 1);
      }, 2500);
    };

    const channel = subscribePostgresChanges(
      supabase,
      `sitter-dashboard-live-${sitterId}`,
      [
        {
          event: "*",
          table: BOOKINGS_TABLE,
          filter: `sitter_id=eq.${sitterId}`,
          handler: refreshSitterLiveState
        },
        {
          event: "*",
          table: SESSIONS_TABLE,
          filter: `sitter_id=eq.${sitterId}`,
          handler: refreshSitterLiveState
        }
      ],
      (status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[sitter-dashboard] realtime:", status, err?.message);
          refreshSitterLiveState();
        }
      }
    );

    return () => {
      if (statsRefreshTimer) clearTimeout(statsRefreshTimer);
      removeRealtimeChannel(supabase, channel);
    };
  }, [sitterId, loading, checkingAuthEnforcement]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !sitterId || loading || checkingAuthEnforcement) return;

    const handler = (payload: any) => {
      if (payload.eventType !== "INSERT") return;
      const newRow = payload.new;
      if (!newRow) return;

      const createdAt =
        typeof newRow.created_at === "string"
          ? newRow.created_at
          : typeof newRow.createdAt === "string"
            ? newRow.createdAt
            : null;
      if (createdAt) {
        const ageMs = Date.now() - Date.parse(createdAt);
        if (Number.isFinite(ageMs) && ageMs > 45_000) return;
      }

      const kind = typeof newRow.kind === "string" ? newRow.kind : "";
      const title = typeof newRow.title === "string" ? newRow.title : "";
      const body = typeof newRow.body === "string" ? newRow.body : "";

      const msg = title || body || "עדכון חדש";
      const tone: "emerald" | "amber" | "rose" =
        kind.includes("approved")
          ? "emerald"
          : kind.includes("rejected") || kind.includes("cancelled")
            ? "rose"
            : "amber";

      const notifId = typeof newRow.id === "string" ? newRow.id : null;
      const toastKey = notifId ? `${notifId}:${kind}` : `${msg}:${Date.now()}`;
      if (lastBookingToastKeyRef.current === toastKey) return;
      lastBookingToastKeyRef.current = toastKey;

      setBookingRealtimeToast(msg);
      setBookingRealtimeToastTone(tone);
      lastRealtimeToastAtRef.current = Date.now();

      const now = Date.now();
      if (now - lastNotificationReloadRef.current > 800) {
        lastNotificationReloadRef.current = now;
        void reloadTodaysBookingRef.current();
        void refreshForUserRef.current(supabase, sitterId);
      }
    };

    const channel = subscribePostgresChanges(
      supabase,
      `sitter-notifications-${sitterId}`,
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${sitterId}`,
        handler
      },
      (status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[sitter-dashboard] notifications realtime:", status, err?.message);
        }
      }
    );

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [sitterId, loading, checkingAuthEnforcement]);

  useEffect(() => {
    if (checkingAuthEnforcement) return;
    void reloadTodaysBooking();
  }, [reloadTodaysBooking, checkingAuthEnforcement, pendingRow?.id, pendingRow?.status, activeShiftRow?.id, activeShiftRow?.status, endConfirmRow?.id, endConfirmRow?.status, completedSummaryRow?.id, completedSummaryRow?.status]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !sitterId || loading || checkingAuthEnforcement) return;

    const terminalStatus = completedSummaryRow
      ? sitterSessionStatusKey(completedSummaryRow)
      : "";
    const inFlight = Boolean(
      pendingRow ||
        activeShiftRow ||
        endConfirmRow ||
        pendingApprovalBooking ||
        terminalStatus === "sitter_completed" ||
        terminalStatus === "payment_pending"
    );

    const tick = () => {
      void reloadTodaysBooking();
      void refreshForUser(supabase, sitterId);
    };

    const intervalMs = inFlight || todaysBookingHook ? 5000 : 12000;
    const id = window.setInterval(tick, intervalMs);
    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      tick();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [
    sitterId,
    loading,
    checkingAuthEnforcement,
    pendingRow,
    activeShiftRow,
    endConfirmRow,
    pendingApprovalBooking,
    completedSummaryRow,
    todaysBookingHook,
    reloadTodaysBooking,
    refreshForUser
  ]);

  useEffect(() => {
    if (pathname !== "/sitter/dashboard" || !sitterId || checkingAuthEnforcement) return;
    const supabase = getSupabaseBrowserClient();
    if (supabase) void refreshSitterProfileCardStatus(supabase, sitterId);
    setDashboardStatsRefreshKey((k) => k + 1);
  }, [pathname, sitterId, checkingAuthEnforcement, refreshSitterProfileCardStatus]);

  const handleSitterMandatoryRatingComplete = useCallback(async (rating: number, comment: string | null) => {
    if (!completedSummaryRow || !sitterId) return;
    const sid = String(completedSummaryRow.id);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setSitterClosureError("Supabase לא מוגדר."); return; }
    const sitterIdTemp = sitterId;
    setSitterClosureBusy(true);
    setSitterClosureError(null);
    const result = await submitSessionRating(supabase, {
      sessionId: sid,
      role: SITTER_ROLE,
      rating,
      comment
    });
    if (!result.ok) { setSitterClosureError(result.error); setSitterClosureBusy(false); return; }
    markSitterSessionRatedLocally(sid);
    dismissCompletedSession(sid, "sitter");
    suppressCompletedSummaryIdRef.current = sid;
    applyCircleBooking(null);
    setCompletedSummaryRow(null); setPendingRow(null); setActiveShiftRow(null); setEndConfirmRow(null);
    setBanner(null);
    setSitterClosureBusy(false);
    await refreshForUser(supabase, sitterIdTemp);
    router.refresh();
  }, [completedSummaryRow, sitterId, refreshForUser, router, applyCircleBooking, setCompletedSummaryRow, setPendingRow, setActiveShiftRow, setEndConfirmRow, suppressCompletedSummaryIdRef]);

  const clearSitterShiftUi = useCallback(() => {
    applyCircleBooking(null);
    setPendingRow(null);
    setActiveShiftRow(null);
    setEndConfirmRow(null);
    setCompletedSummaryRow(null);
    setPendingApprovalBooking(null);
    setBanner(null);
    setForceEndToast(null);
    setSitterClosureError(null);
  }, [applyCircleBooking, setPendingRow, setActiveShiftRow, setEndConfirmRow, setCompletedSummaryRow]);

  useEffect(() => {
    if (!bookingGuardReady) return;
    if (todaysBooking?.id || todayBookingShiftGate?.id) return;
    clearSitterShiftUi();
  }, [bookingGuardReady, todaysBooking?.id, todayBookingShiftGate?.id, clearSitterShiftUi]);

  useEffect(() => {
    const onNewBooking = () => {
      setCompletedSummaryRow(null);
      suppressCompletedSummaryIdRef.current = null;
      applyCircleBooking(null);
      void reloadTodaysBooking();
      const supabase = getSupabaseBrowserClient();
      if (supabase && sitterId) void refreshForUser(supabase, sitterId);
    };
    window.addEventListener(ANYNANNY_NEW_BOOKING_EVENT, onNewBooking);
    return () => window.removeEventListener(ANYNANNY_NEW_BOOKING_EVENT, onNewBooking);
  }, [
    applyCircleBooking,
    reloadTodaysBooking,
    refreshForUser,
    setCompletedSummaryRow,
    sitterId,
    suppressCompletedSummaryIdRef
  ]);

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

  const displayedStuckBooking = todaysBooking ?? activeCircleBooking;
  const displayedStuckSession = endConfirmRow ?? activeShiftRow;

  const handleConfirmReleaseStuckShift = useCallback(async (
    reasonId: ReleaseStuckShiftReasonId,
    detail: string
  ) => {
    if (releasingStuckShift) return;

    const targets = resolveDisplayedStuckShiftTargets(displayedStuckBooking, displayedStuckSession);
    if ("error" in targets) {
      setReleaseStuckModalError(targets.error);
      setBanner(targets.error);
      return;
    }

    setReleasingStuckShift(true);
    setReleaseStuckModalError(null);
    setBanner(null);

    try {
      const auth = await resolveBrowserAuth();
      if (!auth.ok) {
        const message = RELEASE_STUCK_SHIFT_COPY.genericFailure;
        setReleaseStuckModalError(message);
        setBanner(message);
        return;
      }

      const result = await markDisplayedStuckShiftForReview(auth.supabase, {
        actorId: auth.userId,
        actorRole: "sitter",
        bookingId: targets.bookingId,
        sessionId: targets.sessionId,
        reasonId,
        detail
      });

      if (!result.ok) {
        setReleaseStuckModalError(result.error);
        setBanner(result.error);
        if (sitterId) {
          await refreshForUser(auth.supabase, sitterId).catch(() => undefined);
        }
        return;
      }

      setStuckShiftReviewNotice(true);
      await reloadTodaysBooking().catch(() => undefined);
      if (sitterId) {
        await refreshForUser(auth.supabase, sitterId).catch(() => undefined);
      }
      setReleaseStuckModalOpen(false);
    } catch (err) {
      console.warn("[sitter-dashboard] release stuck shift", err);
      const message = RELEASE_STUCK_SHIFT_COPY.genericFailure;
      setReleaseStuckModalError(message);
      setBanner(message);
      const supabase = getSupabaseBrowserClient();
      if (supabase && sitterId) {
        await refreshForUser(supabase, sitterId).catch(() => undefined);
      }
    } finally {
      setReleasingStuckShift(false);
    }
  }, [
    releasingStuckShift,
    displayedStuckBooking,
    displayedStuckSession,
    sitterId,
    refreshForUser,
    reloadTodaysBooking
  ]);

  const liveElapsed = useMemo(() => {
    const row = endConfirmRow ?? activeShiftRow;
    if (!row?.start_time || row.status !== "active") return 0;
    const startMs = new Date(row.start_time).getTime();
    const parentEndMs = row.parent_end_requested_at ? new Date(row.parent_end_requested_at).getTime() : null;
    return computeLiveElapsedSecondsActive({ startMs, parentEndRequestedAtMs: parentEndMs, nowMs });
  }, [endConfirmRow, activeShiftRow, nowMs]);

  const liveTimerText = useMemo(() => formatElapsed(liveElapsed), [liveElapsed]);

  /** Same canonical rate as parent: booking.hourly_rate_nis snapshot (no hardcoded fallback). */
  const liveHourlyRate = useMemo(() => {
    return resolveLiveHourlyRateNis(
      todaysBooking?.hourly_rate_nis ?? activeCircleBooking?.hourly_rate_nis
    );
  }, [
    todaysBooking?.hourly_rate_nis,
    activeCircleBooking?.hourly_rate_nis
  ]);

  const liveEarned = useMemo(() => {
    if (liveHourlyRate == null) return "0.00";
    return computeLiveAccruedNis(liveElapsed, liveHourlyRate);
  }, [liveElapsed, liveHourlyRate]);

  const confirmStartShift = async () => {
    if (!pendingRow || !sitterId) return;
    const auth = await resolveBrowserAuth();
    if (!auth.ok) { setBanner(auth.reason === "no_client" ? "Supabase לא מוגדר." : "יש להתחבר לפני אישור משמרת."); return; }
    const startIso = new Date().toISOString();
    try {
      const { error } = await auth.supabase.from(SESSIONS_TABLE).update({ status: "active", sitter_id: sitterId, start_time: startIso, start_confirmed: true }).eq("id", pendingRow.id);
      if (error) { setBanner(friendlySupabaseSessionError(error)); return; }
      setBanner(null);
      await refreshForUser(auth.supabase, sitterId);
      router.refresh();
    } catch (e) { setBanner(friendlySupabaseSessionError(e)); }
  };

  const completeSessionRow = async (row: SupabaseSessionRow) => {
    if (!sitterId) return;
    const bookingId = readSessionLinkedBookingId(row, todaysBooking?.id ?? activeCircleBooking?.id ?? null) || todaysBooking?.id || null;
    if (bookingId) persistShiftLocallyDismissed(bookingId);
    const auth = await resolveBrowserAuth();
    if (!auth.ok) { setBanner(auth.reason === "no_client" ? "Supabase לא מוגדר." : "יש להתחבר לפני סיום משמרת."); return; }
    setEndShiftBusy(true);
    try {
      const { error } = await sitterCompleteSession(auth.supabase, sitterId, row.id, row.start_time);
      if (error) { setBanner(friendlySupabaseSessionError(error)); return; }

      if (bookingId) {
        await sitterMarkBookingEnded(auth.supabase, sitterId, String(bookingId));
      }

      setBanner(null); suppressCompletedSummaryIdRef.current = null; applyCircleBooking(null);
      await refreshForUser(auth.supabase, sitterId); await reloadTodaysBooking(); router.refresh();
    } catch (e) { setBanner(friendlySupabaseSessionError(e)); } finally { setEndShiftBusy(false); }
  };

  const confirmEndShift = async () => { if (endConfirmRow) await completeSessionRow(endConfirmRow); };
  const endActiveSession = async () => { if (activeShiftRow) await completeSessionRow(activeShiftRow); };

  const onboardingPending = false;
  const pendingBookingCount = useSitterPendingBookingCount(sitterId, !onboardingPending);
  const cancellationAttention = useCancellationAttention(sitterId, "sitter", Boolean(sitterId));

  const handleOnboardingSaved = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !sitterId) return;

    const completedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from(SITTER_PROFILES_TABLE)
      .update({ onboarding_completed_at: completedAt, updated_at: completedAt })
      .eq(SITTER_PROFILES_USER_COLUMN, sitterId)
      .select("onboarding_completed_at")
      .maybeSingle();

    if (error) {
      setBanner(error.message);
      return;
    }

    setProfileCardStatus(hasSitterCompletedOnboarding(data ?? { onboarding_completed_at: completedAt }) ? "complete" : "incomplete");
    setDashboardStatsRefreshKey((k) => k + 1);
    router.replace("/sitter/dashboard");
    router.refresh();
  }, [sitterId, router]);

  const sitterInFlightActive = Boolean(pendingRow || activeShiftRow || endConfirmRow);
  const hasBookingAnchor = Boolean(todaysBooking?.id || todayBookingShiftGate?.id);
  const sitterHasLiveBooking =
    Boolean(activeCircleBooking) &&
    !bookingRequiresAdminReview(activeCircleBooking) &&
    isSitterShiftCircleStatus(activeCircleBooking?.status) &&
    !isSitterBookingAwaitingApprovalStatus(todayBookingShiftGate?.status ?? null);

  const isCircleShiftWithinActivationWindow = useMemo(() => {
    if (!activeCircleBooking?.start_time || !activeCircleBooking?.end_time) return false;
    const window = buildShiftWindowMs(activeCircleBooking, Date.now());
    if (!window) return false;
    const now = Date.now();
    return now >= window.startMs - SHIFT_ACTIVATION_LEAD_MS && now <= window.endMs;
  }, [activeCircleBooking?.id, activeCircleBooking?.start_time, activeCircleBooking?.end_time, activeCircleBooking?.status, nowMs]);

  const sitterTerminalDbStatus = sitterSessionStatusKey(completedSummaryRow);
  const gateAllowsSettlement = bookingAllowsSettlementClosureUi(
    todayBookingShiftGate?.status ?? todaysBooking?.status
  );
  const showSitterAwaitingParentApproval =
    hasBookingAnchor &&
    gateAllowsSettlement &&
    sitterTerminalDbStatus === "sitter_completed" &&
    !sitterInFlightActive &&
    !sessionUiBlockedByBooking;
  const showSitterWaitingForPayment =
    hasBookingAnchor &&
    gateAllowsSettlement &&
    sitterTerminalDbStatus === "payment_pending" &&
    !sitterInFlightActive &&
    !sessionUiBlockedByBooking;
  const isSessionPaidAndReadyForRating =
    hasBookingAnchor && gateAllowsSettlement && sitterTerminalDbStatus === "paid";
  const showSitterCompletedClosure =
    (isSessionPaidAndReadyForRating || showSitterWaitingForPayment) &&
    Boolean(completedSummaryRow) &&
    !sitterInFlightActive &&
    !showSitterAwaitingParentApproval;
  const sitterInSettlement =
    showSitterAwaitingParentApproval ||
    showSitterWaitingForPayment ||
    showSitterCompletedClosure;
  const showReleaseStuckShiftButton =
    Boolean(displayedStuckBooking?.id) &&
    Boolean(displayedStuckSession?.id) &&
    !sitterInSettlement &&
    !bookingRequiresAdminReview(displayedStuckBooking) &&
    (hasConfirmedDoubleShakeStart(displayedStuckSession) ||
      Boolean(activeShiftRow) ||
      Boolean(endConfirmRow));
  
  const showSitterIdleWelcome =
    bookingGuardReady &&
    !sessionUiBlockedByBooking &&
    !sitterInFlightActive &&
    !showSitterCompletedClosure &&
    !showSitterAwaitingParentApproval &&
    !showSitterWaitingForPayment &&
    !sitterHasLiveBooking &&
    !showSitterBookingApproval;

  const showDoubleShakeShiftPanel =
    onboardingPending ||
    sitterInFlightActive ||
    showSitterAwaitingParentApproval ||
    showSitterCompletedClosure ||
    showSitterBookingApproval ||
    (sitterHasLiveBooking && isCircleShiftWithinActivationWindow && !sessionUiBlockedByBooking);

  const sitterStatusPanelKey = pendingApprovalBooking?.id
    ? `approve:${pendingApprovalBooking.id}:${String(pendingApprovalBooking.status ?? "")}`
    : activeShiftRow?.id
      ? `active:${activeShiftRow.id}`
      : pendingRow?.id
        ? `pending:${pendingRow.id}`
        : endConfirmRow?.id
          ? `end:${endConfirmRow.id}`
          : completedSummaryRow?.id
            ? `done:${completedSummaryRow.id}:${sitterTerminalDbStatus}`
            : showSitterBookingApproval
              ? "booking-approval"
              : null;
  const showSitterStatusPanel =
    showDoubleShakeShiftPanel &&
    !onboardingPending &&
    (!sitterStatusPanelKey || statusPanelDismissedKey !== sitterStatusPanelKey);

  // Expanded Active Shift panel: free vertical space by hiding shortcuts / external actions.
  const isActiveShiftExpanded = showSitterStatusPanel && !statusPanelCollapsed;
  const shouldHideDashboardActions = isActiveShiftExpanded;
  const sitterStatusCollapsedSummary = showSitterAwaitingParentApproval
    ? "ממתין לאישור הורה — לחצו להרחבה"
    : showSitterWaitingForPayment
      ? "ממתינים לתשלום — לחצו להרחבה"
      : isSessionPaidAndReadyForRating
        ? "תשלום התקבל — דרגו את המשפחה"
        : endConfirmRow
          ? "בקשת סיום משמרת — לחצו להרחבה"
          : pendingRow
            ? "ממתין לאישור התחלה — לחצו להרחבה"
            : activeShiftRow
              ? `משמרת פעילה · ${liveTimerText}`
              : showSitterBookingApproval
                ? "בקשת משמרת ממתינה — לחצו להרחבה"
                : "סטטוס משמרת — לחצו להרחבה";

  useEffect(() => {
    setStatusPanelCollapsed(false);
  }, [sitterStatusPanelKey]);

  const showLoading = checkingAuthEnforcement || (loading && !sitterBootstrapComplete && !(pendingRow || activeShiftRow || endConfirmRow));

  if (showLoading) {
    return (
      <main className="mx-auto flex h-full min-h-0 w-full max-w-md items-center justify-center bg-[#FDFBF6] py-10" dir="rtl">
        <p className="text-right text-sm text-slate-600 animate-pulse">בודק הרשאות גישה ומאמת פרופיל…</p>
      </main>
    );
  }

  const sessionSection = (
    <>
      {showSitterAwaitingParentApproval && completedSummaryRow ? (
            <div className="mt-auto flex w-full flex-1 flex-col items-center justify-center gap-4 px-4 pt-4 text-center">
              <p className="text-base font-bold text-[#001F3F]">ממתין לאישור הורה</p>
              <p className="max-w-[18rem] text-sm leading-snug text-slate-600">סיימת את המשמרת — ההורה צריך לאשר את הסיום כדי להמשיך לתשלום.</p>
            </div>
          ) : showSitterCompletedClosure && completedSummaryRow ? (
            <div className="mt-auto flex w-full flex-1 flex-col items-center justify-center gap-4 pt-4">
              {isSessionPaidAndReadyForRating ? (
                <div className="w-full space-y-4">
                  <div className="mx-auto max-w-[17rem] rounded-2xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                    <p className="text-sm font-bold text-emerald-900">✓ התשלום התקבל בהצלחה!</p>
                    <p className="text-xs text-emerald-700/90 mt-0.5">הסכום התווסף לארנק שלך. יש לדרג את המשפחה לסגירת המעגל.</p>
                  </div>
                  <SitterMandatoryRatingPanel busy={sitterClosureBusy} errorMessage={sitterClosureError} onComplete={handleSitterMandatoryRatingComplete} />
                </div>
              ) : (
                <div className="max-w-[17rem] space-y-2 px-2 text-center">
                  <p className="text-base font-bold text-[#001F3F]">המשמרת אושרה לסיום</p>
                  <p className="text-sm leading-snug text-slate-600">ממתינים לתשלום מההורה…</p>
                  <p className="text-xs text-slate-500">לאחר אישור התשלום תוכלו לדרג את המשפחה.</p>
                </div>
              )}
            </div>
          ) : endConfirmRow && !sessionUiBlockedByBooking ? (
            <>
              <div className="w-full shrink-0 space-y-2 text-right">
                <p className="text-sm font-semibold text-[#001F3F]">ההורה ביקש לסיים את המשמרת</p>
                <p className="text-4xl font-bold tabular-nums text-navy-header">{liveTimerText}</p>
                <p className="text-sm font-semibold text-navy-800">סכום שנצבר: ₪{liveEarned}</p>
              </div>
              <div className="mt-auto flex w-full flex-1 flex-col items-center justify-center gap-4 pt-8">
                <DoubleShakeCircleButton label={endShiftBusy ? "מסיים משמרת…" : "סיום משמרת"} variant="salmon" busy={endShiftBusy} onClick={() => void confirmEndShift()} />
              </div>
            </>
          ) : pendingRow && !sessionUiBlockedByBooking ? (
            <>
              <div className="w-full shrink-0 space-y-2 text-right">
                <p className="text-xs font-medium text-slate-600">ממתין לאישור שלך</p>
                <p className="text-sm font-semibold text-slate-700">משמרת חדשה מההורה</p>
              </div>
              <div className="mt-auto flex w-full flex-1 flex-col items-center justify-center gap-4 pt-8">
                <DoubleShakeCircleButton label="אישור התחלת משמרת" variant="navy" onClick={() => void confirmStartShift()} />
              </div>
            </>
          ) : activeShiftRow && !sessionUiBlockedByBooking ? (
            <>
              <div className="w-full shrink-0 space-y-2 text-right">
                <p className="text-xs font-medium text-slate-600">משמרת פעילה</p>
                <p className="text-4xl font-bold tabular-nums tracking-wide text-[#001F3F]">{liveTimerText}</p>
                <p className="text-sm font-semibold text-navy-800">סכום שנצבר: ₪{liveEarned}</p>
                <p className="text-xs text-slate-500">לחצו לסיום המשמרת ועצירת הטיימר.</p>
              </div>
              <div className="mt-auto flex w-full flex-1 flex-col items-center justify-center gap-4 pt-8">
                <DoubleShakeCircleButton label={endShiftBusy ? "מסיים משמרת…" : "סיום משמרת"} variant="salmon" busy={endShiftBusy} onClick={() => void endActiveSession()} />
              </div>
            </>
          ) : showSitterBookingApproval && pendingApprovalBooking && sitterId ? (
            <div className="mt-auto flex w-full flex-1 flex-col items-center justify-center gap-4 pt-4">
              <SitterShiftApprovalCard sitterId={sitterId} booking={pendingApprovalBooking} onResponded={() => { applyCircleBooking(null); void reloadTodaysBooking(); }} onError={(msg) => setBanner(msg)} />
            </div>
          ) : showSitterBookingApproval ? (
            <p className="text-center text-sm text-slate-600">טוען בקשה ממתינה…</p>
          ) : showSitterIdleWelcome ? (
            <div className="flex w-full flex-1 flex-col items-center justify-center gap-3 px-4 py-6 text-center">
              <p className="text-base font-bold text-[#001F3F]">היומן שלך פנוי כרגע</p>
              <p className="max-w-[18rem] text-sm leading-snug text-slate-600">ברגע שהורה יזמין אותך, פרטי המשמרת יופיעו כאן!</p>
            </div>
          ) : (
            <DoubleShakeCircleSlot>
              <SitterDoubleShakeIdleCircle
                key={sitterCircleLiveKey}
                booking={activeCircleBooking ?? todaysBooking}
                ready={bookingGuardReady}
                onBookingUpdated={reloadTodaysBooking}
                onError={(msg) => setBanner(msg)}
                onForceEndSuccess={() => void handleForceEndSuccess()}
              />
            </DoubleShakeCircleSlot>
          )}
    </>
  );

  return (
    <main className="mx-auto flex h-full min-h-0 w-full max-w-md flex-col overflow-hidden bg-[#FDFBF6]" dir="rtl">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden py-2">
        <div className="shrink-0">
          <SitterDashboardHeader
            firstName={firstName}
            nameLoading={greetingNameLoading}
            sitterId={sitterId}
            refreshKey={dashboardStatsRefreshKey}
            showPublicId={sitterSerialLoaded}
            publicDisplayId={sitterPublicDisplayId}
            publicIdLoaded={sitterSerialLoaded}
            avatarUrl={sitterAvatarUrl}
          />
        </div>
          {stuckShiftReviewNotice ? (
            <div
              role="status"
              className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-right text-xs text-amber-950"
            >
              <p className="font-bold">{STUCK_SHIFT_REVIEW_LABEL}</p>
              <p className="mt-1 leading-snug">{STUCK_SHIFT_REVIEW_SUPPORT}</p>
            </div>
          ) : null}
          {forceEndToast ? (
            <div role="status" aria-live="polite" className="flex shrink-0 flex-row-reverse items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-right text-sm font-semibold text-emerald-900">
              <button type="button" aria-label="סגור" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-800/70 transition hover:bg-emerald-100 hover:text-emerald-950" onClick={() => setForceEndToast(null)}>
                <X className="h-4 w-4" aria-hidden />
              </button>
              <p className="min-w-0 flex-1">{forceEndToast}</p>
            </div>
          ) : null}
          {bookingRealtimeToast ? (
            <div
              role="status"
              aria-live="polite"
              className={`flex shrink-0 flex-row-reverse items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-right text-sm font-semibold shadow-sm ${
                bookingRealtimeToastTone === "emerald"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                  : bookingRealtimeToastTone === "rose"
                    ? "border-rose-300 bg-rose-50 text-rose-900"
                    : "border-amber-300 bg-amber-50 text-amber-900"
              }`}
            >
              <button
                type="button"
                aria-label="סגור"
                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-white/70 ${
                  bookingRealtimeToastTone === "emerald"
                    ? "text-emerald-800/70 hover:text-emerald-950"
                    : bookingRealtimeToastTone === "rose"
                      ? "text-rose-800/70 hover:text-rose-950"
                      : "text-amber-800/70 hover:text-amber-950"
                }`}
                onClick={() => setBookingRealtimeToast(null)}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
              <p className="min-w-0 flex-1 leading-snug">{bookingRealtimeToast}</p>
            </div>
          ) : null}
          {banner ? (
            <div role="status" className="flex shrink-0 flex-row-reverse items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-right text-sm text-amber-950">
              <button
                type="button"
                aria-label="סגור"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-amber-900/70 transition hover:bg-amber-100 hover:text-amber-950"
                onClick={() => setBanner(null)}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
              <p className="min-w-0 flex-1 leading-snug">{banner}</p>
            </div>
          ) : null}
          <div className={`relative flex min-h-0 flex-1 flex-col overflow-hidden ${onboardingPending ? "min-h-[16rem]" : ""}`}>
            <div
              className={`flex min-h-0 flex-1 flex-col overflow-hidden ${onboardingPending ? "pointer-events-none select-none blur-[3px] opacity-50" : ""}`}
              aria-hidden={onboardingPending}
            >
              {onboardingPending ? (
                <section id="sitter-profile-details" className="shrink-0 rounded-3xl border-2 border-amber-300/80 bg-white p-4 shadow-soft ring-1 ring-amber-200/60 sm:p-5">
                  <h2 className="text-right text-base font-bold text-navy-header">השלמת פרופיל מקצועי (חובה)</h2>
                  <p className="mt-1 text-right text-xs leading-relaxed text-slate-600">יש להשלים את הטופס לפני שימוש ביומן, ארנק ומשמרות. מספר הנני האישי יופיע בראש המסך לאחר השמירה.</p>
                </section>
              ) : null}
              {!shouldHideDashboardActions ? (
                <section className="shrink-0 rounded-3xl bg-white p-3 shadow-soft sm:p-4">
                  <div className="grid min-w-0 grid-cols-3 gap-2.5">
                    <Link
                      href="/sitter/availability"
                      aria-label="סידור עבודה"
                      className="group flex min-h-[6.5rem] min-w-0 flex-col items-end justify-between gap-2 rounded-2xl border border-emerald-600/15 bg-emerald-50/40 p-3 text-right text-navy-header shadow-sm transition hover:border-emerald-600/30 hover:shadow-md active:scale-[0.98]"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-600/10">
                        <Calendar className="h-6 w-6 stroke-[1.75]" aria-hidden />
                      </span>
                      <span className="w-full text-right text-xs font-semibold leading-snug sm:text-sm">סידור עבודה</span>
                    </Link>
                    <Link
                      href="/sitter/wallet"
                      className="group flex min-h-[6.5rem] min-w-0 flex-col items-end justify-between gap-2 rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 p-3 text-right text-navy-header shadow-sm transition hover:border-navy-header/25 hover:shadow-md active:scale-[0.98]"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-navy-header/10">
                        <Wallet className="h-6 w-6 stroke-[1.75]" aria-hidden />
                      </span>
                      <span className="w-full text-right text-xs font-semibold leading-snug sm:text-sm">הארנק שלי</span>
                    </Link>
                    <Link
                      href="/sitter/shifts"
                      aria-label={cancellationAttention.showDot ? "המשמרות שלי — יש עדכון ביטול" : pendingBookingCount > 0 ? `המשמרות שלי — ${pendingBookingCount} בקשות ממתינות` : "המשמרות שלי"}
                      className="group flex min-h-[6.5rem] min-w-0 flex-col items-end justify-between gap-2 rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 p-3 text-right text-navy-header shadow-sm transition hover:border-navy-header/25 hover:shadow-md active:scale-[0.98]"
                    >
                      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-navy-header/10">
                        <History className="h-6 w-6 stroke-[1.75]" aria-hidden />
                        <CancellationAttentionDot visible={cancellationAttention.showDot} />
                        {pendingBookingCount > 0 ? (
                          <span className="absolute right-0 top-0 flex h-4 min-w-4 -translate-y-0.5 translate-x-0.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[12px] font-bold leading-none text-white ring-2 ring-white" aria-hidden>
                            {pendingBookingCount > 9 ? "9+" : pendingBookingCount}
                          </span>
                        ) : null}
                      </span>
                      <span className="w-full text-right text-xs font-semibold leading-snug sm:text-sm">המשמרות שלי</span>
                    </Link>
                  </div>
                </section>
              ) : null}
              {showSitterStatusPanel ? (
                <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
                  <DashboardStatusCard
                    collapsedSummary={sitterStatusCollapsedSummary}
                    collapsed={statusPanelCollapsed}
                    onToggleCollapse={() => setStatusPanelCollapsed((v) => !v)}
                    onDismiss={() => {
                      if (sitterStatusPanelKey) setStatusPanelDismissedKey(sitterStatusPanelKey);
                      setStatusPanelCollapsed(false);
                    }}
                    tone={
                      endConfirmRow || showSitterAwaitingParentApproval
                        ? "rose"
                        : showSitterBookingApproval || pendingRow
                          ? "amber"
                          : "emerald"
                    }
                    className="min-h-0"
                  >
                    <DoubleShakeShiftPanel className="min-h-0">
                      <div id="sitter-shift-panel" className="flex min-h-0 flex-col">
                        {sessionSection}
                      </div>
                    </DoubleShakeShiftPanel>
                  </DashboardStatusCard>
                </div>
              ) : null}
            </div>
            {onboardingPending ? (
              <div className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto px-4 py-8 bg-[#FDFBF6]/95 backdrop-blur-sm">
                <div className="w-full max-w-sm my-auto">
                  <SitterOnboardingWizard onSaved={handleOnboardingSaved} />
                </div>
              </div>
            ) : null}
          </div>
          {!shouldHideDashboardActions && sitterBootstrapComplete && sitterId && !onboardingPending ? (
            <div className="flex w-full shrink-0 flex-col gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3 rounded-b-3xl">
              {showReleaseStuckShiftButton ? (
                <button
                  type="button"
                  disabled={releasingStuckShift}
                  onClick={handleOpenReleaseStuckShiftModal}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 shadow-sm transition hover:bg-amber-100 active:scale-[0.97] disabled:opacity-60"
                >
                  <span>{releasingStuckShift ? "משחרר…" : "שחרור משמרת תקועה"}</span>
                </button>
              ) : null}
              <LogoutButton />
            </div>
          ) : null}
          {sitterId ? (
            <SitterBroadcastAlertModal sitterId={sitterId} paused={showSitterBookingApproval} />
          ) : null}
          <CancellationAttentionModals attention={cancellationAttention} role="sitter" />
          <ReleaseStuckShiftModal
            open={releaseStuckModalOpen}
            busy={releasingStuckShift}
            error={releaseStuckModalError}
            warning={SITTER_RELEASE_STUCK_SHIFT_WARNING}
            onClose={handleCloseReleaseStuckShiftModal}
            onConfirm={(reasonId, detail) => {
              void handleConfirmReleaseStuckShift(reasonId, detail);
            }}
          />
        </div>
      </main>
  );
}