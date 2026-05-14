"use client";

import Link from "next/link";
import { Calendar, History, Settings, Wallet } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SITTER_PROFILE_SAVED_NAV_FLAG, SitterOnboardingWizard } from "@/components/sitter/sitter-onboarding-wizard";
import { useAuth } from "@/components/auth-provider";
import {
  isSitterProfileComplete,
  SITTER_PROFILES_TABLE,
  SITTER_PROFILES_USER_COLUMN,
  type SitterProfileRow
} from "@/lib/sitter/sitter-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";
import { SessionFinalSummary } from "@/components/session/session-final-summary";
import { completedSummaryFromSessionRow } from "@/lib/session/completed-summary";
import { dismissCompletedSession, readDismissedCompletedSessionId } from "@/lib/session/dismissed-completed";
import {
  HOURLY_RATE,
  SESSIONS_TABLE,
  SESSION_PENDING_START_STATUSES,
  SESSION_SITTER_SHIFT_ACTIVE_STATUSES,
  computeLiveElapsedSecondsActive,
  type SupabaseSessionRow,
  formatElapsed,
  isSitterShiftActiveStatus
} from "@/lib/session/protocol";
import { SESSION_ACTION_CIRCLE_STYLE, SESSION_CIRCLE_SHELL_CLASS } from "@/lib/session/session-circle";
import { friendlySupabaseSessionError } from "@/lib/session/supabase-errors";

/** DB `sitter_id` = nanny; null = open assignment. */
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
  const { displayName } = useAuth();
  const [sitterId, setSitterId] = useState<string | null>(null);
  const [pendingRow, setPendingRow] = useState<SupabaseSessionRow | null>(null);
  const [endConfirmRow, setEndConfirmRow] = useState<SupabaseSessionRow | null>(null);
  /** Assigned to this sitter with status pending | started | active (see protocol). Drives main circle + timer. */
  const [sitterMainShiftRow, setSitterMainShiftRow] = useState<SupabaseSessionRow | null>(null);
  /** Latest completed session for this sitter — final summary until dismissed. */
  const [completedSummaryRow, setCompletedSummaryRow] = useState<SupabaseSessionRow | null>(null);
  const [sitterHourlyRateNis, setSitterHourlyRateNis] = useState(HOURLY_RATE);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  /** Wall clock for live timer — must tick every second so elapsed updates (same formula as parent). */
  const [nowMs, setNowMs] = useState(Date.now());
  const [profileCardStatus, setProfileCardStatus] = useState<"loading" | "complete" | "incomplete">("loading");

  const firstName = useMemo(() => {
    const n = displayName?.trim();
    if (!n) return "";
    return n.split(/\s+/)[0] ?? "";
  }, [displayName]);

  const refreshForUser = useCallback(async (supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>, uid: string) => {
    const [pendRes, actRes, sitterMainRes, completedRes] = await Promise.all([
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
        .limit(20),
      supabase
        .from(SESSIONS_TABLE)
        .select("*")
        .eq("sitter_id", uid)
        .in("status", [...SESSION_SITTER_SHIFT_ACTIVE_STATUSES])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from(SESSIONS_TABLE)
        .select("*")
        .eq("sitter_id", uid)
        .eq("status", "completed")
        .order("end_time", { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    if (pendRes.error) {
      console.warn("[sitter dashboard] pending fetch:", pendRes.error.message);
    }
    if (actRes.error) {
      console.warn("[sitter dashboard] active fetch:", actRes.error.message);
    }
    if (sitterMainRes.error) {
      console.warn("[sitter dashboard] sitter main shift fetch:", sitterMainRes.error.message);
    }
    if (completedRes.error) {
      console.warn("[sitter dashboard] completed session fetch:", completedRes.error.message);
    }

    const pendList = (pendRes.data ?? []) as SupabaseSessionRow[];
    const actList = (actRes.data ?? []) as SupabaseSessionRow[];
    const nextMainShift = (sitterMainRes.data ?? null) as SupabaseSessionRow | null;
    setSitterMainShiftRow(nextMainShift);

    const pending = pendList[0] ?? null;

    let endConfirm: SupabaseSessionRow | null = null;
    for (const row of actList) {
      if (rowMatchesEndConfirm(row, uid)) {
        endConfirm = row;
        break;
      }
    }

    setPendingRow(pending);
    setEndConfirmRow(endConfirm);

    const dismissed = readDismissedCompletedSessionId("sitter");
    const blockCompletedSummary =
      endConfirm != null ||
      pending != null ||
      (nextMainShift != null && isSitterShiftActiveStatus(nextMainShift.status));

    let completedForSummary: SupabaseSessionRow | null = null;
    if (!blockCompletedSummary && !completedRes.error && completedRes.data) {
      const c = completedRes.data as SupabaseSessionRow;
      if (dismissed == null || String(c.id) !== dismissed) {
        completedForSummary = c;
      }
    }
    setCompletedSummaryRow(completedForSummary);
  }, []);

  const refreshSitterProfileCardStatus = useCallback(
    async (supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>, uid: string) => {
      const fk = SITTER_PROFILES_USER_COLUMN;
      const { data, error } = await supabase
        .from(SITTER_PROFILES_TABLE)
        .select("full_name, bio, years_experience, hourly_rate_nis")
        .eq(fk, uid)
        .maybeSingle();
      if (error) {
        console.warn("[sitter dashboard] profile card fetch:", error.message);
        setProfileCardStatus("incomplete");
        return;
      }
      if (data != null && isSitterProfileComplete(data as Partial<SitterProfileRow>)) {
        setProfileCardStatus("complete");
      } else {
        setProfileCardStatus("incomplete");
      }
      const rateRaw = data != null ? Number((data as { hourly_rate_nis?: unknown }).hourly_rate_nis) : NaN;
      setSitterHourlyRateNis(Number.isFinite(rateRaw) && rateRaw > 0 ? rateRaw : HOURLY_RATE);
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
   * Double-Shake: full `sessions` feed so INSERT (open pending), UPDATE (assign sitter, status, start_time),
   * and parent end-request all refresh the main button + timer without narrowing filters.
   */
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !sitterId || loading) return;

    const onSessionsChange = () => {
      void refreshForUser(supabase, sitterId);
    };

    const channelName = `sitter-sessions-rt-${sitterId}`;
    const channel = supabase.channel(channelName);

    for (const ev of ["INSERT", "UPDATE", "DELETE"] as const) {
      channel.on(
        "postgres_changes",
        { event: ev, schema: "public", table: SESSIONS_TABLE },
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
  }, [sitterId, loading, refreshForUser]);

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
  }, [pathname, sitterId, refreshSitterProfileCardStatus]);

  const dismissCompletedSummary = useCallback(async () => {
    if (!completedSummaryRow || !sitterId) return;
    const supabase = getSupabaseBrowserClient();
    dismissCompletedSession(String(completedSummaryRow.id), "sitter");
    setCompletedSummaryRow(null);
    if (supabase) {
      await refreshForUser(supabase, sitterId);
    }
    router.refresh();
  }, [completedSummaryRow, sitterId, refreshForUser, router]);

  /** Elapsed for the main shift button — same freeze rules as parent end-request on active rows. */
  const mainShiftElapsed = useMemo(() => {
    const row = sitterMainShiftRow;
    if (!row?.start_time) return 0;
    const startMs = new Date(row.start_time).getTime();
    const parentEndMs = row.parent_end_requested_at
      ? new Date(row.parent_end_requested_at).getTime()
      : null;
    if (row.status === "active" && parentEndMs != null) {
      return computeLiveElapsedSecondsActive({
        startMs,
        parentEndRequestedAtMs: parentEndMs,
        nowMs
      });
    }
    return Math.max(0, Math.floor((nowMs - startMs) / 1000));
  }, [sitterMainShiftRow, nowMs]);

  const mainShiftTimerText = useMemo(() => formatElapsed(mainShiftElapsed), [mainShiftElapsed]);
  const mainShiftEarned = useMemo(
    () => ((mainShiftElapsed / 3600) * HOURLY_RATE).toFixed(2),
    [mainShiftElapsed]
  );

  /**
   * Exactly one primary circle: parent end approval → parent start approval → live shift (not pending-start) → idle.
   * Must not treat pending-start rows as “active_timer” or the navy and green circles stack.
   */
  const mainCircleMode = useMemo((): "end_confirm" | "start_confirm" | "active_timer" | "idle" => {
    if (endConfirmRow) return "end_confirm";
    if (pendingRow) return "start_confirm";
    if (
      sitterMainShiftRow &&
      isSitterShiftActiveStatus(sitterMainShiftRow.status) &&
      !SESSION_PENDING_START_STATUSES.includes(sitterMainShiftRow.status)
    ) {
      return "active_timer";
    }
    return "idle";
  }, [endConfirmRow, pendingRow, sitterMainShiftRow]);

  const sessionCaption = useMemo(() => {
    if (completedSummaryRow) {
      return <p className="text-xs text-slate-500">&nbsp;</p>;
    }
    if (mainCircleMode === "end_confirm") {
      return (
        <>
          <p className="text-sm font-semibold text-[#001F3F]">ההורה ביקש לסיים את המשמרת</p>
          <p className="text-sm font-semibold text-navy-800">סכום שנצבר: ₪{mainShiftEarned}</p>
        </>
      );
    }
    if (mainCircleMode === "start_confirm") {
      return (
        <>
          <p className="text-xs font-medium text-slate-600">ממתין לאישור שלך</p>
          <p className="text-sm font-semibold text-slate-700">משמרת חדשה מההורה</p>
        </>
      );
    }
    if (mainCircleMode === "active_timer") {
      return (
        <>
          <p className="text-sm font-semibold text-navy-800">סכום שנצבר: ₪{mainShiftEarned}</p>
          <p className="text-xs text-slate-500">
            סיום המשמרת מתבצע מהצד של ההורה; כאן תופיע בקשת סיום לאישור.
          </p>
        </>
      );
    }
    return <p className="text-xs text-slate-500">&nbsp;</p>;
  }, [completedSummaryRow, mainCircleMode, mainShiftEarned]);

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

  const confirmEndShift = async () => {
    if (!endConfirmRow?.start_time || !sitterId) return;
    const auth = await resolveBrowserAuth();
    if (!auth.ok) {
      setBanner(auth.reason === "no_client" ? "Supabase לא מוגדר." : "יש להתחבר לפני אישור סיום.");
      return;
    }
    if (auth.userId !== sitterId) {
      setBanner("פג תוקף ההזדהות — רעננו את הדף והתחברו מחדש.");
      return;
    }
    const endIso = new Date().toISOString();
    const startMs = new Date(endConfirmRow.start_time).getTime();
    const endMs = new Date(endIso).getTime();
    const finalSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
    const exactMinutes = Math.max(0, Math.floor((endMs - startMs) / 60000));
    const { data: prof, error: profErr } = await auth.supabase
      .from(SITTER_PROFILES_TABLE)
      .select("hourly_rate_nis")
      .eq(SITTER_PROFILES_USER_COLUMN, sitterId)
      .maybeSingle();
    const rateRaw = Number(prof?.hourly_rate_nis);
    const hourly = !profErr && Number.isFinite(rateRaw) && rateRaw > 0 ? rateRaw : HOURLY_RATE;
    const finalAmount = Math.round((hourly / 60) * exactMinutes * 100) / 100;
    try {
      const { error } = await auth.supabase
        .from(SESSIONS_TABLE)
        .update({
          status: "completed",
          end_time: endIso,
          sitter_end_confirmed_at: endIso,
          parent_end_requested_at: null,
          final_elapsed_seconds: finalSeconds,
          final_amount_nis: finalAmount
        })
        .eq("id", endConfirmRow.id);
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

  if (loading) {
    return (
      <main className="mx-auto flex min-h-[40vh] w-full max-w-md items-center justify-center bg-[#FDFBF6] py-10" dir="rtl">
        <p className="text-right text-sm text-slate-600">טוען…</p>
      </main>
    );
  }

  const sessionSection = (
    <div className="flex w-full min-h-0 flex-1 flex-col gap-4">
      <div className="flex min-h-[5.25rem] w-full flex-col justify-center gap-1.5 text-right">{sessionCaption}</div>

      {/* Fixed 240×240 slot — only one branch mounts so nothing stacks */}
      <div className="flex w-full flex-1 flex-col items-center justify-center py-2">
        {completedSummaryRow ? (
          <SessionFinalSummary
            {...completedSummaryFromSessionRow(completedSummaryRow, sitterHourlyRateNis)}
            onDismiss={() => void dismissCompletedSummary()}
          />
        ) : (
          <div className="flex h-[240px] w-[240px] shrink-0 items-center justify-center">
            {mainCircleMode === "end_confirm" ? (
              <button
                type="button"
                style={SESSION_ACTION_CIRCLE_STYLE}
                onClick={() => void confirmEndShift()}
                className={`${SESSION_CIRCLE_SHELL_CLASS} gap-1 bg-[#FF8A8A] text-lg shadow-[0_10px_36px_-8px_rgba(255,138,138,0.75)] ring-[#FF8A8A]/40 transition hover:brightness-105 active:brightness-95 sm:text-xl`}
              >
                <span className="max-w-[13rem]">אישור סיום משמרת</span>
              </button>
            ) : null}

            {mainCircleMode === "start_confirm" ? (
              <button
                type="button"
                style={SESSION_ACTION_CIRCLE_STYLE}
                onClick={() => void confirmStartShift()}
                className={`${SESSION_CIRCLE_SHELL_CLASS} gap-1 bg-[#001F3F] shadow-[0_12px_40px_-10px_rgba(0,31,63,0.65)] ring-[#001F3F]/25 transition hover:brightness-110 active:brightness-95`}
              >
                <span className="max-w-[13rem]">אישור התחלת משמרת</span>
                <span className="max-w-[13rem] text-base font-semibold opacity-90">Double-Shake</span>
              </button>
            ) : null}

            {mainCircleMode === "active_timer" && sitterMainShiftRow ? (
              <button
                type="button"
                style={SESSION_ACTION_CIRCLE_STYLE}
                aria-live="polite"
                className={`${SESSION_CIRCLE_SHELL_CLASS} cursor-default select-none gap-1 bg-emerald-600 text-lg shadow-[0_12px_40px_-10px_rgba(22,163,74,0.5)] ring-emerald-500/35 active:bg-emerald-600 sm:text-xl`}
              >
                <span className="max-w-[13rem] leading-tight">משמרת פעילה</span>
                <span className="max-w-[13rem] text-2xl font-bold tabular-nums tracking-wide sm:text-3xl">{mainShiftTimerText}</span>
              </button>
            ) : null}

            {mainCircleMode === "idle" ? (
              <button
                type="button"
                style={SESSION_ACTION_CIRCLE_STYLE}
                aria-disabled={true}
                tabIndex={0}
                className={`${SESSION_CIRCLE_SHELL_CLASS} cursor-not-allowed gap-1 bg-[#001F3F] shadow-[0_12px_40px_-10px_rgba(0,31,63,0.65)] ring-[#001F3F]/25 active:bg-[#dc2626] active:shadow-[0_12px_40px_-10px_rgba(220,38,38,0.45)] active:ring-red-500/40 sm:text-xl`}
                onClick={(e) => {
                  e.preventDefault();
                }}
              >
                <span className="max-w-[13rem] leading-tight">אין משמרת פעילה</span>
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-md flex-col space-y-5 bg-[#FDFBF6] py-2" dir="rtl">
      <header className="text-right">
        <h1 className="text-xl font-bold leading-snug text-[#001F3F] sm:text-[1.35rem]">
          שלום{firstName ? `, ${firstName}` : ""}! מה תרצה לעשות היום?
        </h1>
        {profileCardStatus === "incomplete" ? (
          <a
            href="#sitter-profile-details"
            className="mt-2 inline-block text-xs font-semibold text-emerald-800 underline decoration-emerald-700/50"
          >
            השלמת פרופיל מקצועי (אופציונלי)
          </a>
        ) : null}
      </header>

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

      <section className="rounded-3xl bg-white p-4 shadow-soft sm:p-5">
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/sitter/calendar"
            className="group flex min-h-[7.25rem] flex-col items-end justify-between gap-2 rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 p-3 text-right text-navy-header shadow-sm transition hover:border-navy-header/25 hover:shadow-md active:scale-[0.98]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-navy-header/10">
              <Calendar className="h-7 w-7 stroke-[1.75]" aria-hidden />
            </span>
            <span className="w-full text-right text-xs font-semibold leading-snug sm:text-sm">יומן מפגשים</span>
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
            href="/sitter/session"
            className="group flex min-h-[7.25rem] flex-col items-end justify-between gap-2 rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 p-3 text-right text-navy-header shadow-sm transition hover:border-navy-header/25 hover:shadow-md active:scale-[0.98]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-navy-header/10">
              <History className="h-7 w-7 stroke-[1.75]" aria-hidden />
            </span>
            <span className="w-full text-right text-xs font-semibold leading-snug sm:text-sm">היסטוריית שמרטפות</span>
          </Link>
        </div>
      </section>

      {profileCardStatus === "incomplete" ? (
        <section
          id="sitter-profile-details"
          className="rounded-3xl bg-white p-4 shadow-soft sm:p-5"
        >
          <h2 className="text-right text-base font-bold text-navy-header">פרופיל מקצועי (אופציונלי)</h2>
          <p className="mt-1 text-right text-xs text-slate-600">
            השלימו פרטים כדי להופיע בחיפוש; אפשר לחזור בכל עת.
          </p>
          <div className="mt-4">
            <SitterOnboardingWizard />
          </div>
        </section>
      ) : null}

      <section
        id="sitter-shift-panel"
        className="mt-1 flex min-h-0 flex-1 flex-col items-center rounded-3xl border-2 border-[#001F3F]/20 bg-white p-4 shadow-[0_16px_48px_-12px_rgba(0,31,63,0.45)] sm:p-6"
      >
        {sessionSection}
      </section>
    </main>
  );
}
