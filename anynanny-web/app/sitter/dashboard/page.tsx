"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Calendar, History, Wallet, LogOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboardGreetingName } from "@/lib/user/use-dashboard-greeting-name";
import { SitterMandatoryRatingPanel } from "@/components/session/sitter-mandatory-rating-panel";
import { StuckShiftDevResetButton } from "@/components/sitter/stuck-shift-dev-reset";
import { SitterOnboardingWizard } from "@/components/sitter/sitter-onboarding-wizard";
import { SitterDashboardHeader } from "@/components/sitter/sitter-dashboard-header";
import { SitterBroadcastAlertModal } from "@/components/sitter/SitterBroadcastAlertModal"; 
import {
  fetchProfileSerialId,
  formatSitterPublicIdFromSerial
} from "@/lib/public/sequential-display-id";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";
import {
  HOURLY_RATE,
  SESSIONS_TABLE,
  SESSION_PENDING_START_STATUSES,
  computeLiveElapsedSecondsActive,
  type SupabaseSessionRow,
  formatElapsed
} from "@/lib/session/protocol";
import { dismissCompletedSession, readDismissedCompletedSessionId, shouldSuppressStaleCompletedSession } from "@/lib/session/dismissed-completed";
import { readSessionLinkedBookingId, SESSIONS_PROTOCOL_SELECT_MINIMAL } from "@/lib/session/sessions-query";
import { persistShiftLocallyDismissed } from "@/lib/session/dismissed-shift-lock";
import {
  DoubleShakeCircleButton,
  DoubleShakeCircleSlot,
  DoubleShakeShiftPanel
} from "@/components/session/double-shake-circle-button";
import { BOOKINGS_TABLE, SITTER_FORCE_END_SUCCESS_MESSAGE } from "@/lib/bookings/constants";
import { SitterDoubleShakeIdleCircle } from "@/components/session/sitter-double-shake-idle-circle";
import { SitterShiftApprovalCard } from "@/components/sitter/sitter-shift-approval-card";
import { doesBookingBlockSessionShiftUi } from "@/lib/bookings/booking-shift-ui";
import { isSitterBookingAwaitingApprovalStatus } from "@/lib/bookings/booking-realtime-handler";
import { bookingLiveSyncKey } from "@/lib/bookings/booking-live-key";
import { fetchTodayBookingShiftGate, fetchTodaysPendingBookingRequest, type TodaysLinkedBookingView } from "@/lib/bookings/todays-linked-booking";
import { normalizeBookingStatus } from "@/lib/bookings/use-shift-activation-status";
import {
  useTodaysLinkedBooking,
  type TodaysLinkedBookingSyncPayload
} from "@/lib/bookings/use-todays-linked-booking";
import { sitterCompleteSession } from "@/lib/session/sitter-complete-session";
import { friendlySupabaseSessionError } from "@/lib/session/supabase-errors";
import { submitSessionRating } from "@/lib/ratings/submit-session-rating";
import { useSitterPendingBookingCount } from "@/lib/bookings/use-sitter-pending-booking-count";
import { useSession } from "@/context/SessionContext";
import { clearDeviceAuthHints } from "@/lib/auth/returning-user";

const SITTER_DASHBOARD_SESSION_SELECT = SESSIONS_PROTOCOL_SELECT_MINIMAL;
const SITTER_TERMINAL_SESSION_STATUSES = ["completed", "sitter_completed", "payment_pending", "paid"];

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
    sitterId,
    setSitterId,
    pendingRow,
    setPendingRow,
    activeShiftRow,
    setActiveShiftRow,
    endConfirmRow,
    setEndConfirmRow,
    completedSummaryRow,
    setCompletedSummaryRow,
    bootstrapComplete: sitterBootstrapComplete,
    setBootstrapComplete: setSitterBootstrapComplete,
    bookingCache: sitterBookingCache,
    patchBookingCache: patchSitterBookingCache,
    circleBooking,
    applyCircleBooking,
    syncFromPayload,
    syncFromLinkedBooking,
    suppressCompletedSummaryIdRef
  } = sessionSitter;

  const [sitterClosureBusy, setSitterClosureBusy] = useState(false);
  const [sitterClosureError, setSitterClosureError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !sitterBootstrapComplete);
  const [banner, setBanner] = useState<string | null>(null);
  const [forceEndToast, setForceEndToast] = useState<string | null>(null);
  const [endShiftBusy, setEndShiftBusy] = useState(false);
  const [profileCardStatus, setProfileCardStatus] = useState<"loading" | "complete" | "incomplete">("loading");
  const [dashboardStatsRefreshKey, setDashboardStatsRefreshKey] = useState(0);
  const [sitterPublicDisplayId, setSitterPublicDisplayId] = useState<string | null>(null);
  const [sitterSerialLoaded, setSitterSerialLoaded] = useState(false);
  const [pendingApprovalBooking, setPendingApprovalBooking] = useState<TodaysLinkedBookingView | null>(
    null
  );

  const handleBookingLiveSync = useCallback(
    (payload: TodaysLinkedBookingSyncPayload) => {
      syncFromPayload(payload);
      if (payload.booking) {
        syncFromLinkedBooking(payload.booking);
      }
    },
    [syncFromPayload, syncFromLinkedBooking]
  );

  const { fullName, nameLoading: greetingNameLoading } = useDashboardGreetingName(
    "sitter",
    sitterId,
    dashboardStatsRefreshKey
  );

  const {
    booking: todaysBookingHook,
    shiftGate: todayBookingShiftGateHook,
    ready: bookingGuardReadyHook,
    reload: reloadTodaysBooking
  } = useTodaysLinkedBooking("sitter", sitterId, {
    onBookingSync: handleBookingLiveSync
  });

  useEffect(() => {
    patchSitterBookingCache({
      booking: todaysBookingHook,
      shiftGate: todayBookingShiftGateHook,
      ready: bookingGuardReadyHook
    });
  }, [
    todaysBookingHook,
    todayBookingShiftGateHook,
    bookingGuardReadyHook,
    patchSitterBookingCache
  ]);

  const bookingGuardReady = bookingGuardReadyHook || sitterBookingCache.ready;
  const todaysBooking = todaysBookingHook ?? sitterBookingCache.booking;
  const todayBookingShiftGate = todayBookingShiftGateHook ?? sitterBookingCache.shiftGate;

  useEffect(() => {
    syncFromLinkedBooking(todaysBooking);
  }, [
    todaysBooking?.id,
    todaysBooking?.status,
    todaysBooking?.updated_at,
    todaysBooking?.start_time,
    todaysBooking?.end_time,
    syncFromLinkedBooking
  ]);

  const idleCircleBooking = circleBooking ?? todaysBooking;
  const gateBookingStatus = normalizeBookingStatus(todayBookingShiftGate?.status) ?? "";

  // 🔥 הגנה קריטית: אם המשמרת ב-Gate מסומנת כגמורה, דואגים לאפס אקטיבית את ה-Circle בזיכרון המקומי
  useEffect(() => {
    if (gateBookingStatus === "completed" || gateBookingStatus === "cancelled" || gateBookingStatus === "rejected") {
      if (circleBooking != null) {
        applyCircleBooking(null);
      }
    }
  }, [gateBookingStatus, circleBooking, applyCircleBooking]);

  const sessionUiBlockedByBooking = useMemo(
    () => bookingGuardReady && doesBookingBlockSessionShiftUi(todayBookingShiftGate),
    [bookingGuardReady, todayBookingShiftGate]
  );

  const showSitterBookingApproval =
    bookingGuardReady &&
    !sessionUiBlockedByBooking &&
    isSitterBookingAwaitingApprovalStatus(gateBookingStatus);

  useEffect(() => {
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
    todayBookingShiftGate?.id,
    todayBookingShiftGate?.updated_at
  ]);

  const activeCircleBooking = showSitterBookingApproval ? null : idleCircleBooking;

  const sitterCircleLiveKey = useMemo(
    () => bookingLiveSyncKey(activeCircleBooking),
    [
      activeCircleBooking?.id,
      activeCircleBooking?.status,
      activeCircleBooking?.updated_at,
      todaysBooking?.id,
      todaysBooking?.status,
      todaysBooking?.updated_at
    ]
  );

  const resolveShiftBookingId = useCallback((): string | null => {
    const fromBooking = todaysBooking?.id ?? idleCircleBooking?.id ?? null;
    if (fromBooking) return fromBooking;
    return null;
  }, [todaysBooking?.id, idleCircleBooking?.id]);

  const lockShiftForToday = useCallback(() => {
    const bookingId = resolveShiftBookingId();
    if (bookingId) {
      persistShiftLocallyDismissed(bookingId);
    }
    // איפוס קאש אקטיבי כדי למנוע את מצב העיגול התקוע
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
    const [pendRes, actRes] = await Promise.all([
      supabase
        .from(SESSIONS_TABLE)
        .select(SITTER_DASHBOARD_SESSION_SELECT)
        .or(`sitter_id.is.null,sitter_id.eq.${uid}`)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from(SESSIONS_TABLE)
        .select(SITTER_DASHBOARD_SESSION_SELECT)
        .eq("status", "active")
        .eq("sitter_id", uid)
        .order("created_at", { ascending: false })
        .limit(20)
    ]);

    const pendingStatuses = new Set(SESSION_PENDING_START_STATUSES);
    const pendList = ((pendRes.data ?? []) as SupabaseSessionRow[]).filter((row) =>
      pendingStatuses.has(String(row.status))
    );
    const actList = (actRes.data ?? []) as SupabaseSessionRow[];

    const pending = pendList[0] ?? null;
    let endConfirm: SupabaseSessionRow | null = null;
    let activeOnly: SupabaseSessionRow | null = null;

    for (const row of actList) {
      if (rowMatchesEndConfirm(row, uid)) {
        endConfirm = row;
        break;
      }
    }
    for (const row of actList) {
      if (row.status === "active" && row.sitter_id === uid && !parentRequestedEndAt(row)) {
        activeOnly = row;
        break;
      }
    }

    setPendingRow(pending);
    setEndConfirmRow(endConfirm);
    setActiveShiftRow(activeOnly);

    const gate = await fetchTodayBookingShiftGate(supabase, uid, "sitter");
    if (doesBookingBlockSessionShiftUi(gate)) {
      setPendingRow(null);
      setEndConfirmRow(null);
      setActiveShiftRow(null);
    }

    const dismissedId = readDismissedCompletedSessionId("sitter");
    
    const { data: completedData, error: completedErr } = await supabase
      .from(SESSIONS_TABLE)
      .select(SITTER_DASHBOARD_SESSION_SELECT)
      .in("status", SITTER_TERMINAL_SESSION_STATUSES)
      .eq("sitter_id", uid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let completedShow: SupabaseSessionRow | null = null;
    if (!completedErr && completedData) {
      const c = completedData as SupabaseSessionRow;
      const cid = String(c.id);
      
      if (suppressCompletedSummaryIdRef.current === cid) {
        completedShow = null;
      } else if (dismissedId != null && cid === dismissedId) {
        completedShow = null;
      } else if (c.sitter_rating != null) { 
        completedShow = null;
      } else {
        completedShow = c;
      }
    }

    const terminalStatus = sitterSessionStatusKey(completedShow);
    const isProcessingClosure = 
      terminalStatus === "sitter_completed" || 
      terminalStatus === "completed" || 
      terminalStatus === "paid" || 
      terminalStatus === "payment_pending";

    if (isProcessingClosure) {
      setPendingRow(null);
      setEndConfirmRow(null);
      setActiveShiftRow(null);
    } else {
      const gateStatus = normalizeBookingStatus(gate?.status);
      if (!gate?.id || gateStatus === "completed" || gateStatus === "rejected" || gateStatus === "cancelled") {
        completedShow = null;
      } else if (
        shouldSuppressStaleCompletedSession({
          completedRow: completedShow,
          bookingStatus: gate?.status ?? null,
          hasInFlightSession: Boolean(pending || endConfirm || activeOnly)
        })
      ) {
        completedShow = null;
      }
    }

    setCompletedSummaryRow(completedShow);
  }, [setPendingRow, setEndConfirmRow, setActiveShiftRow, setCompletedSummaryRow, suppressCompletedSummaryIdRef]);

  const refreshSitterProfileCardStatus = useCallback(
    async (supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>, uid: string) => {
      setProfileCardStatus("complete");
    },
    []
  );

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      setBanner("Supabase לא מוגדר.");
      return;
    }

    let cancelled = false;

    void (async () => {
      const auth = await resolveBrowserAuth();
      if (!auth.ok) {
        if (!cancelled) {
          setLoading(false);
          setBanner(
            auth.reason === "no_client"
              ? "Supabase לא מוגדר."
              : "יש להתחבר כדי לראות משמרות."
          );
        }
        return;
      }
      if (cancelled) return;
      setSitterId(auth.userId);
      await Promise.all([
        refreshForUser(auth.supabase, auth.userId),
        refreshSitterProfileCardStatus(auth.supabase, auth.userId)
      ]);
      if (cancelled) return;
      setLoading(false);
      setSitterBootstrapComplete(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshForUser, refreshSitterProfileCardStatus, setSitterBootstrapComplete, setSitterId]);

  useEffect(() => {
    if (!sitterId) {
      setSitterSerialLoaded(false);
      setSitterPublicDisplayId(null);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;
    setSitterSerialLoaded(false);
    void (async () => {
      const { serialId, role, error } = await fetchProfileSerialId(supabase, sitterId);
      if (cancelled) return;
      if (error) {
        console.warn("[sitter] profile serial load:", error);
      } else if (role === "sitter") {
        setSitterPublicDisplayId(formatSitterPublicIdFromSerial(serialId));
      }
      setSitterSerialLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [sitterId]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !sitterId || loading) return;

    const refreshSitterBookingState = () => {
      void reloadTodaysBooking();
      void refreshForUser(supabase, sitterId);
      setDashboardStatsRefreshKey((k) => k + 1);
    };

    const channel = supabase
      .channel(`sitter-dashboard-bookings-${sitterId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: BOOKINGS_TABLE,
          filter: `sitter_id=eq.${sitterId}`
        },
        refreshSitterBookingState
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          refreshSitterBookingState();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sitterId, loading, reloadTodaysBooking, refreshForUser]);

  useEffect(() => {
    void reloadTodaysBooking();
  }, [
    reloadTodaysBooking,
    pendingRow?.id,
    pendingRow?.status,
    activeShiftRow?.id,
    activeShiftRow?.status,
    endConfirmRow?.id,
    endConfirmRow?.status,
    completedSummaryRow?.id,
    completedSummaryRow?.status
  ]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !sitterId || loading) return;

    const onSessionsChange = () => {
      void refreshForUser(supabase, sitterId);
    };

    const channel = supabase
      .channel(`sitter-sessions-realtime-global-${sitterId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: SESSIONS_TABLE,
          filter: `sitter_id=eq.${sitterId}`
        },
        onSessionsChange
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sitterId, loading, refreshForUser]);

  useEffect(() => {
    if (pathname !== "/sitter/dashboard" || !sitterId) return;
    const supabase = getSupabaseBrowserClient();
    if (supabase) void refreshSitterProfileCardStatus(supabase, sitterId);
    setDashboardStatsRefreshKey((k) => k + 1);
  }, [pathname, sitterId, refreshSitterProfileCardStatus]);

  const handleLogout = async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    clearDeviceAuthHints();
    router.replace("/");
    router.refresh();
  };

  const handleSitterMandatoryRatingComplete = useCallback(
    async (rating: number) => {
      if (!completedSummaryRow || !sitterId) return;

      const sid = String(completedSummaryRow.id);
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setSitterClosureError("Supabase לא מוגדר.");
        return;
      }

      const sitterIdTemp = sitterId;
      setSitterClosureBusy(true);
      setSitterClosureError(null);

      const result = await submitSessionRating(supabase, {
        sessionId: sid,
        role: "sitter",
        rating
      });
      if (!result.ok) {
        setSitterClosureError(result.error);
        setSitterClosureBusy(false);
        return;
      }

      dismissCompletedSession(sid, "sitter");
      suppressCompletedSummaryIdRef.current = sid;
      
      // איפוס קריטי ומוחלט של כל זכר למשמרת הישנה כדי להעלים את העיגול מיד
      applyCircleBooking(null);
      setCompletedSummaryRow(null);
      setPendingRow(null);
      setActiveShiftRow(null);
      setEndConfirmRow(null);
      
      setBanner(null);
      setSitterClosureBusy(false);
      await refreshForUser(supabase, sitterIdTemp);
      router.refresh();
    },
    [completedSummaryRow, sitterId, refreshForUser, router, applyCircleBooking, setCompletedSummaryRow, setPendingRow, setActiveShiftRow, setEndConfirmRow, suppressCompletedSummaryIdRef]
  );

  const handleDevReset = useCallback(async () => {
    applyCircleBooking(null);
    setPendingRow(null);
    setActiveShiftRow(null);
    setEndConfirmRow(null);
    setCompletedSummaryRow(null);
    setBanner(null);
    setForceEndToast(null);
    setSitterClosureError(null);

    const supabase = getSupabaseBrowserClient();
    if (supabase && sitterId) {
      await refreshForUser(supabase, sitterId);
    }
    await reloadTodaysBooking();
    setDashboardStatsRefreshKey((k) => k + 1);
  }, [sitterId, refreshForUser, reloadTodaysBooking, applyCircleBooking, setPendingRow, setActiveShiftRow, setEndConfirmRow, setCompletedSummaryRow]);

  const liveElapsed = useMemo(() => {
    const row = endConfirmRow ?? activeShiftRow;
    if (!row?.start_time || row.status !== "active") return 0;
    const startMs = new Date(row.start_time).getTime();
    const parentEndMs = row.parent_end_requested_at
      ? new Date(row.parent_end_requested_at).getTime()
      : null;
    return computeLiveElapsedSecondsActive({
      startMs,
      parentEndRequestedAtMs: parentEndMs,
      nowMs
    });
  }, [endConfirmRow, activeShiftRow, nowMs]);

  const liveTimerText = useMemo(() => formatElapsed(liveElapsed), [liveElapsed]);
  const liveEarned = useMemo(() => ((liveElapsed / 3600) * HOURLY_RATE).toFixed(2), [liveElapsed]);

  const confirmStartShift = async () => {
    if (!pendingRow || !sitterId) return;
    const auth = await resolveBrowserAuth();
    if (!auth.ok) {
      setBanner(auth.reason === "no_client" ? "Supabase לא מוגדר." : "יש להתחבר לפני אישור משמרת.");
      return;
    }
    const startIso = new Date().toISOString();
    try {
      const { error } = await auth.supabase
        .from(SESSIONS_TABLE)
        .update({
          status: "active",
          sitter_id: sitterId,
          start_time: startIso,
          start_confirmed: true
        })
        .eq("id", pendingRow.id);
      if (error) {
        setBanner(friendlySupabaseSessionError(error));
        return;
      }
      setBanner(null);
      await refreshForUser(auth.supabase, sitterId);
      router.refresh();
    } catch (e) {
      setBanner(friendlySupabaseSessionError(e));
    }
  };

  const completeSessionRow = async (row: SupabaseSessionRow) => {
    if (!sitterId) return;
    const bookingId =
      readSessionLinkedBookingId(row, todaysBooking?.id ?? idleCircleBooking?.id ?? null) ||
      todaysBooking?.id ||
      null;
    if (bookingId) {
      persistShiftLocallyDismissed(bookingId);
    }
    const auth = await resolveBrowserAuth();
    if (!auth.ok) {
      setBanner(auth.reason === "no_client" ? "Supabase לא מוגדר." : "יש להתחבר לפני סיום משמרת.");
      return;
    }
    setEndShiftBusy(true);
    try {
      const { error } = await sitterCompleteSession(
        auth.supabase,
        sitterId,
        row.id,
        row.start_time
      );
      if (error) {
        setBanner(friendlySupabaseSessionError(error));
        return;
      }
      setBanner(null);
      suppressCompletedSummaryIdRef.current = null;
      applyCircleBooking(null); // איפוס הבוקינג בסיום מוצלח של משמרת
      await refreshForUser(auth.supabase, sitterId);
      await reloadTodaysBooking();
      router.refresh();
    } catch (e) {
      setBanner(friendlySupabaseSessionError(e));
    } finally {
      setEndShiftBusy(false);
    }
  };

  const confirmEndShift = async () => {
    if (!endConfirmRow) return;
    await completeSessionRow(endConfirmRow);
  };

  const endActiveSession = async () => {
    if (!activeShiftRow) return;
    await completeSessionRow(activeShiftRow);
  };

  const onboardingPending = profileCardStatus === "incomplete";
  const pendingBookingCount = useSitterPendingBookingCount(sitterId, !onboardingPending);

  const handleOnboardingSaved = useCallback(() => {
    setDashboardStatsRefreshKey((k) => k + 1);
    const supabase = getSupabaseBrowserClient();
    if (supabase && sitterId) {
      void refreshSitterProfileCardStatus(supabase, sitterId);
    }
  }, [sitterId, refreshSitterProfileCardStatus]);

  const sitterInFlightActive = Boolean(pendingRow || activeShiftRow || endConfirmRow);

  const sitterHasLiveBooking =
    Boolean(activeCircleBooking) &&
    gateBookingStatus !== "completed" &&
    gateBookingStatus !== "rejected" &&
    gateBookingStatus !== "cancelled" &&
    !isSitterBookingAwaitingApprovalStatus(gateBookingStatus);

  const sitterTerminalDbStatus = sitterSessionStatusKey(completedSummaryRow);

  const showSitterAwaitingParentApproval =
    sitterTerminalDbStatus === "sitter_completed" &&
    !sitterInFlightActive &&
    !sessionUiBlockedByBooking;

  const showSitterCompletedClosure =
    (sitterTerminalDbStatus === "payment_pending" || sitterTerminalDbStatus === "paid" || sitterTerminalDbStatus === "completed") &&
    Boolean(completedSummaryRow) &&
    !sitterInFlightActive &&
    !showSitterAwaitingParentApproval;

  const showSitterIdleWelcome =
    bookingGuardReady &&
    !sessionUiBlockedByBooking &&
    !sitterInFlightActive &&
    !showSitterCompletedClosure &&
    !showSitterAwaitingParentApproval &&
    !sitterHasLiveBooking &&
    !showSitterBookingApproval;

  const shiftStartTimeForVisibility =
    activeCircleBooking?.start_time ?? todaysBooking?.start_time ?? "";

  const isWithin10Minutes = shiftStartTimeForVisibility
    ? new Date(shiftStartTimeForVisibility).getTime() - Date.now() <= 10 * 60 * 1000
    : false;

  const isShiftCurrentlyActive =
    sitterInFlightActive || showSitterAwaitingParentApproval || showSitterCompletedClosure;

  const showDoubleShakeShiftPanel =
    isShiftCurrentlyActive ||
    showSitterBookingApproval ||
    (sitterHasLiveBooking && isWithin10Minutes && !sessionUiBlockedByBooking);

  const isSessionPaidAndReadyForRating =
    sitterTerminalDbStatus === "paid" || sitterTerminalDbStatus === "completed" || gateBookingStatus === "completed";

  const showLoading =
    loading && !sitterBootstrapComplete && !(pendingRow || activeShiftRow || endConfirmRow);

  if (showLoading) {
    return (
      <main
        className="mx-auto flex h-full min-h-0 w-full max-w-md items-center justify-center bg-[#FDFBF6] py-10"
        dir="rtl"
      >
        <p className="text-right text-sm text-slate-600">טוען…</p>
      </main>
    );
  }

  const sessionSection = (
    <>
      {showSitterAwaitingParentApproval && completedSummaryRow ? (
        <div className="mt-auto flex w-full flex-1 flex-col items-center justify-center gap-4 px-4 pt-4 text-center">
          <p className="text-base font-bold text-[#001F3F]">ממתין לאישור הורה</p>
          <p className="max-w-[18rem] text-sm leading-snug text-slate-600">
            סיימת את המשמרת — ההורה צריך לאשר את הסיום כדי להמשיך לתשלום.
          </p>
        </div>
      ) : showSitterCompletedClosure && completedSummaryRow ? (
        <div className="mt-auto flex w-full flex-1 flex-col items-center justify-center gap-4 pt-4">
          {isSessionPaidAndReadyForRating ? (
            <div className="w-full space-y-4">
              <div className="mx-auto max-w-[17rem] rounded-2xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                <p className="text-sm font-bold text-emerald-900">✓ התשלום התקבל בהצלחה!</p>
                <p className="text-xs text-emerald-700/90 mt-0.5">הסכום התווסף לארנק שלך. יש לדרג את המשפחה לסגירת המעגל.</p>
              </div>
              <SitterMandatoryRatingPanel
                busy={sitterClosureBusy}
                errorMessage={sitterClosureError}
                onComplete={handleSitterMandatoryRatingComplete}
              />
            </div>
          ) : (
            <div className="max-w-[17rem] space-y-2 px-2 text-center">
              <p className="text-base font-bold text-[#001F3F]">המשמרת הסתיימה!</p>
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
            <DoubleShakeCircleButton
              label={endShiftBusy ? "מסיים משמרת…" : "סיום משמרת"}
              variant="salmon"
              busy={endShiftBusy}
              onClick={() => void confirmEndShift()}
            />
          </div>
        </>
      ) : pendingRow && !sessionUiBlockedByBooking ? (
        <>
          <div className="w-full shrink-0 space-y-2 text-right">
            <p className="text-xs font-medium text-slate-600">ממתין לאישור שלך</p>
            <p className="text-sm font-semibold text-slate-700">משמרת חדשה מההורה</p>
          </div>
          <div className="mt-auto flex w-full flex-1 flex-col items-center justify-center gap-4 pt-8">
            <DoubleShakeCircleButton
              label="אישור התחלת משמרת"
              variant="navy"
              onClick={() => void confirmStartShift()}
            />
          </div>
        </>
      ) : activeShiftRow && !sessionUiBlockedByBooking ? (
        <>
          <div className="w-full shrink-0 space-y-2 text-right">
            <p className="text-xs font-medium text-slate-600">משמרת פעילה</p>
            <p className="text-4xl font-bold tabular-nums tracking-wide text-[#001F3F]">{liveTimerText}</p>
            <p className="text-sm font-semibold text-navy-800">סכום שנצבר: ₪{liveEarned}</p>
            <p className="text-xs text-slate-500">
              לחצו לסיום המשמרת ועצירת הטיימר.
            </p>
          </div>
          <div className="mt-auto flex w-full flex-1 flex-col items-center justify-center gap-4 pt-8">
            <DoubleShakeCircleButton
              label={endShiftBusy ? "מסיים משמרת…" : "סיום משמרת"}
              variant="salmon"
              busy={endShiftBusy}
              onClick={() => void endActiveSession()}
            />
          </div>
        </>
      ) : showSitterBookingApproval && pendingApprovalBooking && sitterId ? (
        <div className="mt-auto flex w-full flex-1 flex-col items-center justify-center gap-4 pt-4">
          <SitterShiftApprovalCard
            sitterId={sitterId}
            booking={pendingApprovalBooking}
            onResponded={() => {
              applyCircleBooking(null);
              void reloadTodaysBooking();
            }}
            onError={(msg) => setBanner(msg)}
          />
        </div>
      ) : showSitterBookingApproval ? (
        <p className="text-center text-sm text-slate-600">טוען בקשה ממתינה…</p>
      ) : showSitterIdleWelcome || gateBookingStatus === "completed" ? (
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-3 px-4 py-6 text-center">
          <p className="text-base font-bold text-[#001F3F]">היומן שלך פנוי כרגע</p>
          <p className="max-w-[18rem] text-sm leading-snug text-slate-600">
            ברגע שהורה יזמין אותך, פרטי המשמרת יופיעו כאן!
          </p>
          {pendingBookingCount > 0 ? (
            <Link
              href="/sitter/shifts"
              className="mt-1 rounded-xl bg-[#001F3F] px-4 py-2.5 text-xs font-bold text-white transition hover:brightness-110"
            >
              {pendingBookingCount} בקשות ממתינות — צפייה
            </Link>
          ) : null}
        </div>
      ) : (
        <DoubleShakeCircleSlot>
          <SitterDoubleShakeIdleCircle
            key={sitterCircleLiveKey}
            booking={activeCircleBooking}
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
    <main
      className="mx-auto flex h-full min-h-0 w-full max-w-md flex-col gap-3 overflow-hidden bg-[#FDFBF6] py-2"
      dir="rtl"
    >
      <div className="shrink-0">
        <SitterDashboardHeader
          fullName={fullName}
          nameLoading={greetingNameLoading}
          sitterId={sitterId}
          refreshKey={dashboardStatsRefreshKey}
          showNannyId={profileCardStatus === "complete"}
          publicDisplayId={sitterPublicDisplayId}
          serialIdLoaded={sitterSerialLoaded}
        />
      </div>

      {onboardingPending ? (
        <section
          id="sitter-profile-details"
          className="shrink-0 rounded-3xl border-2 border-amber-300/80 bg-white p-4 shadow-soft ring-1 ring-amber-200/60 sm:p-5"
        >
          <h2 className="text-right text-base font-bold text-navy-header">השלמת פרופיל מקצועי (חובה)</h2>
          <p className="mt-1 text-right text-xs leading-relaxed text-slate-600">
            יש להשלים את הטופס לפני שימוש ביומן, ארנק ומשמרות. מספר הנני האישי יופיע בראש המסך לאחר השמירה.
          </p>
          <div className="mt-4">
            <SitterOnboardingWizard onSaved={handleOnboardingSaved} />
          </div>
        </section>
      ) : null}

      {forceEndToast ? (
        <p
          role="status"
          aria-live="polite"
          className="shrink-0 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-right text-sm font-semibold text-emerald-900"
        >
          {forceEndToast}
        </p>
      ) : null}

      {banner ? (
        <div
          role="status"
          className="flex shrink-0 flex-row-reverse items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-right text-sm text-amber-950"
        >
          <button
            type="button"
            className="shrink-0 font-semibold text-amber-900 underline decoration-amber-700/60"
            onClick={() => setBanner(null)}
          >
            סגור
          </button>
          <p className="min-w-0 flex-1 leading-snug">{banner}</p>
        </div>
      ) : null}

      <div className={`relative flex min-h-0 flex-1 flex-col overflow-hidden ${onboardingPending ? "min-h-[12rem]" : ""}`}>
        {onboardingPending ? (
          <div
            className="pointer-events-none absolute inset-0 z-10 rounded-3xl bg-[#FDFBF6]/55 backdrop-blur-[2px]"
            aria-hidden
          />
        ) : null}

        <section
          className={`shrink-0 rounded-3xl bg-white p-3 shadow-soft sm:p-4 ${onboardingPending ? "pointer-events-none select-none blur-[2px] opacity-55" : ""}`}
          aria-hidden={onboardingPending}
        >
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <Link
              href="/sitter/availability"
              tabIndex={onboardingPending ? -1 : undefined}
              className="group flex min-h-[6rem] flex-row-reverse items-center justify-between gap-4 rounded-2xl border border-emerald-600/15 bg-emerald-50/40 p-4 text-right text-navy-header shadow-sm transition hover:border-emerald-600/30 hover:shadow-md active:scale-[0.98] sm:flex-col sm:items-end sm:justify-between sm:min-h-[6.5rem]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-600/10">
                <Calendar className="h-6 w-6 stroke-[1.75]" aria-hidden />
              </span>
              <div className="flex flex-col text-right sm:w-full">
                <span className="text-sm font-bold sm:text-sm">סידור עבודה</span>
                <span className="text-[11px] text-slate-500 sm:hidden">ניהול ימי ושעות פעילות</span>
              </div>
            </Link>

            <div className="grid grid-cols-2 gap-2.5 sm:col-span-2 sm:grid-cols-2">
              <Link
                href="/sitter/wallet"
                tabIndex={onboardingPending ? -1 : undefined}
                className="group flex min-h-[6.5rem] flex-col items-end justify-between gap-2 rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 p-3 text-right text-navy-header shadow-sm transition hover:border-navy-header/25 hover:shadow-md active:scale-[0.98]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-navy-header/10">
                  <Wallet className="h-6 w-6 stroke-[1.75]" aria-hidden />
                </span>
                <span className="w-full text-right text-xs font-semibold leading-snug sm:text-sm">ארנק ותשלומים</span>
              </Link>

              <Link
                href="/sitter/shifts"
                tabIndex={onboardingPending ? -1 : undefined}
                aria-label={
                  pendingBookingCount > 0
                    ? `המשמרות שלי — ${pendingBookingCount} בקשות ממתינות`
                    : "המשמרות שלי"
                }
                className="group flex min-h-[6.5rem] flex-col items-end justify-between gap-2 rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 p-3 text-right text-navy-header shadow-sm transition hover:border-navy-header/25 hover:shadow-md active:scale-[0.98]"
              >
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-navy-header/10">
                  <History className="h-6 w-6 stroke-[1.75]" aria-hidden />
                  {pendingBookingCount > 0 ? (
                    <span
                      className="absolute right-0 top-0 flex h-4 min-w-4 -translate-y-0.5 translate-x-0.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white"
                      aria-hidden
                    >
                      {pendingBookingCount > 9 ? "9+" : pendingBookingCount}
                    </span>
                  ) : null}
                </span>
                <span className="w-full text-right text-xs font-semibold leading-snug sm:text-sm">המשמרות שלי</span>
              </Link>
            </div>
          </div>
        </section>

        {showDoubleShakeShiftPanel || gateBookingStatus === "completed" ? (
          <DoubleShakeShiftPanel
            className={`min-h-0 flex-1 ${onboardingPending ? "pointer-events-none select-none blur-[2px] opacity-55" : ""}`}
          >
            <div id="sitter-shift-panel" className="flex min-h-0 flex-1 flex-col" aria-hidden={onboardingPending}>
              {sessionSection}
            </div>
          </DoubleShakeShiftPanel>
        ) : null}
      </div>

      {sitterBootstrapComplete && sitterId && (
        <div className="w-full border-t border-slate-100 bg-slate-50/50 px-4 py-3 flex items-center justify-between gap-3 shrink-0 rounded-b-3xl">
          <button
            type="button"
            onClick={() => void handleDevReset()}
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

      {sitterId && <SitterBroadcastAlertModal sitterId={sitterId} />}
    </main>
  );
}