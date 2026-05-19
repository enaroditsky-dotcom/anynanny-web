"use client";

import Link from "next/link";
import { Calendar, History, Settings, Wallet } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDashboardGreetingName } from "@/lib/user/use-dashboard-greeting-name";
import { SessionFinalSummary } from "@/components/session/session-final-summary";
import { SessionRatingModal } from "@/components/session/session-rating-modal";
import { SITTER_PROFILE_SAVED_NAV_FLAG, SitterOnboardingWizard } from "@/components/sitter/sitter-onboarding-wizard";
import { SitterDashboardHeader } from "@/components/sitter/sitter-dashboard-header";
import { SitterPendingBookings } from "@/components/sitter/sitter-pending-bookings";
import {
  hasSitterCompletedOnboarding,
  SITTER_PROFILES_TABLE,
  SITTER_PROFILES_USER_COLUMN,
  type SitterProfileRow
} from "@/lib/sitter/sitter-profile";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
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
import { completedSummaryFromSessionRow } from "@/lib/session/completed-summary";
import { dismissCompletedSession, readDismissedCompletedSessionId } from "@/lib/session/dismissed-completed";
import {
  DoubleShakeCircleButton,
  DoubleShakeCircleSlot,
  DoubleShakeShiftPanel
} from "@/components/session/double-shake-circle-button";
import { SITTER_FORCE_END_SUCCESS_MESSAGE } from "@/lib/bookings/constants";
import { SitterDoubleShakeIdleCircle } from "@/components/session/sitter-double-shake-idle-circle";
import { StuckShiftDevResetButton } from "@/components/sitter/stuck-shift-dev-reset";
import { useTodaysLinkedBooking } from "@/lib/bookings/use-todays-linked-booking";
import { sitterCompleteSession } from "@/lib/session/sitter-complete-session";
import { friendlySupabaseSessionError } from "@/lib/session/supabase-errors";

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
  const [sitterId, setSitterId] = useState<string | null>(null);
  const [pendingRow, setPendingRow] = useState<SupabaseSessionRow | null>(null);
  const [activeShiftRow, setActiveShiftRow] = useState<SupabaseSessionRow | null>(null);
  const [endConfirmRow, setEndConfirmRow] = useState<SupabaseSessionRow | null>(null);
  const [completedSummaryRow, setCompletedSummaryRow] = useState<SupabaseSessionRow | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingTargetSessionId, setRatingTargetSessionId] = useState<string | null>(null);
  /** While rating modal is open after "סיום וסגירה", hide completed summary so the card returns to default (ref survives refreshForUser). */
  const suppressCompletedSummaryIdRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [forceEndToast, setForceEndToast] = useState<string | null>(null);
  const [endShiftBusy, setEndShiftBusy] = useState(false);
  /** Wall clock for live timer — must tick every second so elapsed updates (same formula as parent). */
  const [nowMs, setNowMs] = useState(Date.now());
  const [profileCardStatus, setProfileCardStatus] = useState<"loading" | "complete" | "incomplete">("loading");
  const [dashboardStatsRefreshKey, setDashboardStatsRefreshKey] = useState(0);

  const { fullName, nameLoading: greetingNameLoading } = useDashboardGreetingName(
    "sitter",
    sitterId,
    dashboardStatsRefreshKey
  );

  const {
    booking: todaysBooking,
    ready: bookingGuardReady,
    reload: reloadTodaysBooking
  } = useTodaysLinkedBooking("sitter", sitterId);

  useEffect(() => {
    if (!forceEndToast) return;
    const t = window.setTimeout(() => setForceEndToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [forceEndToast]);

  const handleForceEndSuccess = useCallback(async () => {
    setBanner(null);
    setForceEndToast(SITTER_FORCE_END_SUCCESS_MESSAGE);
    await reloadTodaysBooking();
    setDashboardStatsRefreshKey((k) => k + 1);
  }, [reloadTodaysBooking]);

  const trackedSessionId = useMemo(() => {
    const raw =
      endConfirmRow?.id ?? activeShiftRow?.id ?? pendingRow?.id ?? completedSummaryRow?.id ?? null;
    return raw != null ? String(raw) : null;
  }, [endConfirmRow?.id, activeShiftRow?.id, pendingRow?.id, completedSummaryRow?.id]);

  const refreshForUser = useCallback(async (supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>, uid: string) => {
    const [pendRes, actRes] = await Promise.all([
      supabase
        .from(SESSIONS_TABLE)
        .select("*")
        .in("status", [...SESSION_PENDING_START_STATUSES])
        .or(`sitter_id.is.null,sitter_id.eq.${uid}`)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from(SESSIONS_TABLE)
        .select("*")
        .eq("status", "active")
        .eq("sitter_id", uid)
        .order("created_at", { ascending: false })
        .limit(20)
    ]);

    if (pendRes.error) {
      console.warn("[sitter dashboard] pending fetch:", pendRes.error.message);
    }
    if (actRes.error) {
      console.warn("[sitter dashboard] active fetch:", actRes.error.message);
    }

    const pendList = (pendRes.data ?? []) as SupabaseSessionRow[];
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

    const dismissedId = readDismissedCompletedSessionId("sitter");
    const { data: completedData, error: completedErr } = await supabase
      .from(SESSIONS_TABLE)
      .select("*")
      .eq("status", "completed")
      .eq("sitter_id", uid)
      .order("end_time", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (completedErr) {
      console.warn("[sitter dashboard] completed fetch:", completedErr.message);
    }
    let completedShow: SupabaseSessionRow | null = null;
    if (!completedErr && completedData) {
      const c = completedData as SupabaseSessionRow;
      const cid = String(c.id);
      if (suppressCompletedSummaryIdRef.current === cid) {
        completedShow = null;
      } else if (dismissedId == null || cid !== dismissedId) {
        completedShow = c;
      }
    }
    setCompletedSummaryRow(completedShow);
  }, []);

  const refreshSitterProfileCardStatus = useCallback(
    async (supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>, uid: string) => {
      const fk = SITTER_PROFILES_USER_COLUMN;
      const { data, error } = await supabase
        .from(SITTER_PROFILES_TABLE)
        .select("onboarding_completed_at")
        .eq(fk, uid)
        .maybeSingle();

      if (error) {
        if (isPostgrestMissingColumnError(error.message, "onboarding_completed_at")) {
          console.warn(
            "[sitter dashboard] onboarding_completed_at missing — run Supabase migration and NOTIFY pgrst reload."
          );
        } else {
          console.warn("[sitter dashboard] profile card fetch:", error.message);
        }
        setProfileCardStatus("incomplete");
        return;
      }

      if (data != null && hasSitterCompletedOnboarding(data as Partial<SitterProfileRow>)) {
        setProfileCardStatus("complete");
      } else {
        setProfileCardStatus("incomplete");
      }
    },
    []
  );

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

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
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshForUser, refreshSitterProfileCardStatus]);

  /**
   * When this sitter has a known session row id, listen on `id=eq.{id}` so parent end-request UPDATE is instant.
   * With no row yet, listen to the whole table so the parent's INSERT for a new pending session is still received.
   */
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !sitterId || loading) return;

    const onSessionsChange = () => {
      void refreshForUser(supabase, sitterId);
    };

    const channelName = trackedSessionId
      ? `sitter-session-${sitterId}-${trackedSessionId}`
      : `sitter-sessions-wide-${sitterId}`;
    const channel = supabase.channel(channelName);

    for (const ev of ["INSERT", "UPDATE", "DELETE"] as const) {
      channel.on(
        "postgres_changes",
        trackedSessionId
          ? {
              event: ev,
              schema: "public",
              table: SESSIONS_TABLE,
              filter: `id=eq.${trackedSessionId}`
            }
          : { event: ev, schema: "public", table: SESSIONS_TABLE },
        onSessionsChange
      );
    }

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void refreshForUser(supabase, sitterId);
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sitterId, trackedSessionId, loading, refreshForUser]);

  useEffect(() => {
    if (pathname !== "/sitter/dashboard" || !sitterId) return;
    let fromWizard = false;
    try {
      if (sessionStorage.getItem(SITTER_PROFILE_SAVED_NAV_FLAG) === "1") {
        sessionStorage.removeItem(SITTER_PROFILE_SAVED_NAV_FLAG);
        fromWizard = true;
      }
    } catch {
      /* ignore */
    }
    if (!fromWizard) return;
    const supabase = getSupabaseBrowserClient();
    if (supabase) void refreshSitterProfileCardStatus(supabase, sitterId);
    setDashboardStatsRefreshKey((k) => k + 1);
  }, [pathname, sitterId, refreshSitterProfileCardStatus]);

  const handleSitterRatingResolved = useCallback(() => {
    const sid =
      ratingTargetSessionId ?? (completedSummaryRow != null ? String(completedSummaryRow.id) : null);
    if (sid) {
      dismissCompletedSession(sid, "sitter");
    }
    suppressCompletedSummaryIdRef.current = null;
    setRatingTargetSessionId(null);
    setRatingOpen(false);
    setCompletedSummaryRow(null);
    setPendingRow(null);
    setActiveShiftRow(null);
    setEndConfirmRow(null);
    setBanner(null);
    const supabase = getSupabaseBrowserClient();
    if (supabase && sitterId) void refreshForUser(supabase, sitterId);
    router.push("/sitter/dashboard");
    router.refresh();
  }, [ratingTargetSessionId, completedSummaryRow, sitterId, refreshForUser, router]);

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
    if (auth.userId !== sitterId) {
      setBanner("פג תוקף ההזדהות — רעננו את הדף והתחברו מחדש.");
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
    const auth = await resolveBrowserAuth();
    if (!auth.ok) {
      setBanner(auth.reason === "no_client" ? "Supabase לא מוגדר." : "יש להתחבר לפני סיום משמרת.");
      return;
    }
    if (auth.userId !== sitterId) {
      setBanner("פג תוקף ההזדהות — רעננו את הדף והתחברו מחדש.");
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

  const handleDevReset = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase && sitterId) {
      await refreshForUser(supabase, sitterId);
    }
    await reloadTodaysBooking();
    setDashboardStatsRefreshKey((k) => k + 1);
    setBanner(null);
  }, [sitterId, refreshForUser, reloadTodaysBooking]);

  const openRatingAfterSummaryDismiss = useCallback(() => {
    if (!completedSummaryRow) return;
    const id = String(completedSummaryRow.id);
    suppressCompletedSummaryIdRef.current = id;
    setRatingTargetSessionId(id);
    setCompletedSummaryRow(null);
    setRatingOpen(true);
  }, [completedSummaryRow]);

  const onboardingPending = profileCardStatus === "incomplete";

  const handleOnboardingSaved = useCallback(() => {
    setDashboardStatsRefreshKey((k) => k + 1);
    const supabase = getSupabaseBrowserClient();
    if (supabase && sitterId) {
      void refreshSitterProfileCardStatus(supabase, sitterId);
    }
  }, [sitterId, refreshSitterProfileCardStatus]);

  if (loading) {
    return (
      <main className="mx-auto flex min-h-[40vh] w-full max-w-md items-center justify-center bg-[#FDFBF6] py-10" dir="rtl">
        <p className="text-right text-sm text-slate-600">טוען…</p>
      </main>
    );
  }

  const sessionSection = (
    <>
      {!endConfirmRow && !pendingRow && !activeShiftRow && completedSummaryRow ? (
        <div className="mt-auto flex w-full flex-1 flex-col items-center justify-center gap-4 pt-4">
          <SessionFinalSummary
            {...completedSummaryFromSessionRow(completedSummaryRow, HOURLY_RATE)}
            onDismiss={openRatingAfterSummaryDismiss}
          />
        </div>
      ) : endConfirmRow ? (
        <>
          <div className="w-full space-y-2 text-right">
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
      ) : pendingRow ? (
        <>
          <div className="w-full space-y-2 text-right">
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
      ) : activeShiftRow ? (
        <>
          <div className="w-full space-y-2 text-right">
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
      ) : (
        <DoubleShakeCircleSlot>
          <SitterDoubleShakeIdleCircle
            booking={todaysBooking}
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
    <main className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-md flex-col space-y-5 bg-[#FDFBF6] py-2" dir="rtl">
      <SitterDashboardHeader
        fullName={fullName}
        nameLoading={greetingNameLoading}
        sitterId={sitterId}
        refreshKey={dashboardStatsRefreshKey}
        showNannyId={profileCardStatus === "complete"}
      />

      {onboardingPending ? (
        <section
          id="sitter-profile-details"
          className="rounded-3xl border-2 border-amber-300/80 bg-white p-4 shadow-soft ring-1 ring-amber-200/60 sm:p-5"
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
          className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-right text-sm font-semibold text-emerald-900"
        >
          {forceEndToast}
        </p>
      ) : null}

      {banner ? (
        <div
          role="status"
          className="flex flex-row-reverse items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-right text-sm text-amber-950"
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

      <div className={`relative space-y-5 ${onboardingPending ? "min-h-[12rem]" : ""}`}>
        {onboardingPending ? (
          <div
            className="pointer-events-none absolute inset-0 z-10 rounded-3xl bg-[#FDFBF6]/55 backdrop-blur-[2px]"
            aria-hidden
          />
        ) : null}

        <section
          className={`rounded-3xl bg-white p-4 shadow-soft sm:p-5 ${onboardingPending ? "pointer-events-none select-none blur-[2px] opacity-55" : ""}`}
          aria-hidden={onboardingPending}
        >
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/sitter/availability"
            tabIndex={onboardingPending ? -1 : undefined}
            className="group flex min-h-[7.25rem] flex-col items-end justify-between gap-2 rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 p-3 text-right text-navy-header shadow-sm transition hover:border-navy-header/25 hover:shadow-md active:scale-[0.98]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-navy-header/10">
              <Calendar className="h-7 w-7 stroke-[1.75]" aria-hidden />
            </span>
            <span className="w-full text-right text-xs font-semibold leading-snug sm:text-sm">סידור עבודה</span>
          </Link>

          <Link
            href="/sitter/personal"
            className="group flex min-h-[7.25rem] flex-col items-end justify-between gap-2 rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 p-3 text-right text-navy-header shadow-sm transition hover:border-navy-header/25 hover:shadow-md active:scale-[0.98]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-navy-header/10">
              <Wallet className="h-7 w-7 stroke-[1.75]" aria-hidden />
            </span>
            <span className="w-full text-right text-xs font-semibold leading-snug sm:text-sm">ארנק ותשלומים</span>
          </Link>

          <Link
            href="/sitter/personal"
            className="group flex min-h-[7.25rem] flex-col items-end justify-between gap-2 rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 p-3 text-right text-navy-header shadow-sm transition hover:border-navy-header/25 hover:shadow-md active:scale-[0.98]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-navy-header/10">
              <Settings className="h-7 w-7 stroke-[1.75]" aria-hidden />
            </span>
            <span className="w-full text-right text-xs font-semibold leading-snug sm:text-sm">הגדרות חשבון</span>
          </Link>

          <Link
            href="/sitter/shifts"
            className="group flex min-h-[7.25rem] flex-col items-end justify-between gap-2 rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 p-3 text-right text-navy-header shadow-sm transition hover:border-navy-header/25 hover:shadow-md active:scale-[0.98]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-navy-header/10">
              <History className="h-7 w-7 stroke-[1.75]" aria-hidden />
            </span>
            <span className="w-full text-right text-xs font-semibold leading-snug sm:text-sm">המשמרות שלי</span>
          </Link>
        </div>
      </section>

      <SitterPendingBookings
        sitterId={sitterId}
        disabled={onboardingPending}
        onResponded={() => setDashboardStatsRefreshKey((k) => k + 1)}
      />

      <DoubleShakeShiftPanel
        className={`${onboardingPending ? "pointer-events-none select-none blur-[2px] opacity-55" : ""}`}
      >
        <div id="sitter-shift-panel" aria-hidden={onboardingPending}>
          {sessionSection}
        </div>
      </DoubleShakeShiftPanel>

      <StuckShiftDevResetButton onReset={() => void handleDevReset()} />
      </div>

      <SessionRatingModal
        open={ratingOpen}
        role="sitter"
        sessionId={ratingTargetSessionId}
        onResolved={handleSitterRatingResolved}
      />
    </main>
  );
}
