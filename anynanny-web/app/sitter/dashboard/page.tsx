"use client";

import Link from "next/link";
import { Calendar, History, Settings, Wallet } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FloatingActionButton } from "@/components/floating-action-button";
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
import {
  HOURLY_RATE,
  SESSIONS_TABLE,
  SESSION_PENDING_START_STATUSES,
  computeLiveElapsedSecondsActive,
  type SupabaseSessionRow,
  formatElapsed
} from "@/lib/session/protocol";
import { SESSION_ACTION_CIRCLE_STYLE } from "@/lib/session/session-circle";
import { friendlySupabaseSessionError } from "@/lib/session/supabase-errors";

const SITTER_OPEN_FOR_WORK_KEY = "anynanny_sitter_open_for_work";

/** Match parent search / listing rows: soft shadow, rounded panel. */
const insightCardClass =
  "rounded-2xl border border-navy-header/10 bg-white p-4 text-right shadow-sm shadow-[0_2px_12px_-4px_rgba(0,31,63,0.08)]";

/** DB `sitter_id` = nanny; null = open assignment. */
const circleShell =
  "rounded-full shrink-0 overflow-hidden ring-2 text-lg font-bold leading-tight text-white sm:text-xl [border-radius:50%!important]";

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
  const [activeShiftRow, setActiveShiftRow] = useState<SupabaseSessionRow | null>(null);
  const [endConfirmRow, setEndConfirmRow] = useState<SupabaseSessionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  /** Wall clock for live timer — must tick every second so elapsed updates (same formula as parent). */
  const [nowMs, setNowMs] = useState(Date.now());
  const [profileCardStatus, setProfileCardStatus] = useState<"loading" | "complete" | "incomplete">("loading");
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [openForWork, setOpenForWork] = useState(false);
  const fabStackRef = useRef<HTMLDivElement>(null);

  const firstName = useMemo(() => {
    const n = displayName?.trim();
    if (!n) return "";
    return n.split(/\s+/)[0] ?? "";
  }, [displayName]);

  const trackedSessionId = useMemo(() => {
    const raw = endConfirmRow?.id ?? activeShiftRow?.id ?? pendingRow?.id ?? null;
    return raw != null ? String(raw) : null;
  }, [endConfirmRow?.id, activeShiftRow?.id, pendingRow?.id]);

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
    try {
      setOpenForWork(typeof window !== "undefined" && localStorage.getItem(SITTER_OPEN_FOR_WORK_KEY) === "1");
    } catch {
      setOpenForWork(false);
    }
  }, []);

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

  useEffect(() => {
    if (!quickMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (fabStackRef.current && !fabStackRef.current.contains(e.target as Node)) {
        setQuickMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [quickMenuOpen]);

  const scrollToQuickShift = () => {
    document.getElementById("sitter-shift-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setQuickMenuOpen(false);
  };

  const toggleOpenForWork = () => {
    setOpenForWork((prev) => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(SITTER_OPEN_FOR_WORK_KEY, "1");
        else localStorage.removeItem(SITTER_OPEN_FOR_WORK_KEY);
      } catch {
        /* ignore */
      }
      return next;
    });
  };

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

  const upcomingInsight = useMemo(() => {
    if (endConfirmRow || activeShiftRow) {
      return {
        title: "משמרת פעילה",
        body: "יש משמרת פעילה כרגע — ניהול מלא למטה במסך המשמרת."
      };
    }
    if (pendingRow) {
      return {
        title: "ממתין לאישור",
        body: "הגיעה בקשה להתחלת משמרת מההורה. אשרו למטה כשאתם מוכנים."
      };
    }
    return {
      title: "אין מפגש מתוכנן",
      body: "כשיגיעו בקשות או מועדים מהיומן, יופיעו כאן."
    };
  }, [endConfirmRow, activeShiftRow, pendingRow]);

  const hasSessionForEarnings = Boolean(endConfirmRow ?? activeShiftRow);

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
    try {
      const { error } = await auth.supabase
        .from(SESSIONS_TABLE)
        .update({
          status: "completed",
          end_time: endIso,
          sitter_end_confirmed_at: endIso,
          parent_end_requested_at: null,
          final_elapsed_seconds: finalSeconds,
          final_amount_nis: Number(((finalSeconds / 3600) * HOURLY_RATE).toFixed(2))
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
    <>
      {endConfirmRow ? (
        <>
          <div className="w-full space-y-2 text-right">
            <p className="text-sm font-semibold text-[#001F3F]">ההורה ביקש לסיים את המשמרת</p>
            <p className="text-4xl font-bold tabular-nums text-navy-header">{liveTimerText}</p>
            <p className="text-sm font-semibold text-navy-800">סכום שנצבר: ₪{liveEarned}</p>
          </div>
          <div className="mt-auto flex w-full flex-1 flex-col items-center justify-center gap-4 pt-8">
            <button
              type="button"
              style={SESSION_ACTION_CIRCLE_STYLE}
              onClick={() => void confirmEndShift()}
              className={`${circleShell} gap-2 bg-emerald-600 text-lg shadow-[0_12px_32px_-10px_rgba(5,150,105,0.55)] ring-emerald-700/25 animate-session-pulse-green transition hover:brightness-105 active:brightness-95 sm:text-xl`}
            >
              <span className="max-w-[14rem] px-1">אישור סיום משמרת</span>
            </button>
          </div>
        </>
      ) : pendingRow ? (
        <>
          <div className="w-full space-y-2 text-right">
            <p className="text-sm font-semibold text-slate-700">משמרת חדשה ממתינה לאישור</p>
            <p className="text-xs text-slate-500">מזהה סשן: {String(pendingRow.id).slice(0, 8)}…</p>
          </div>
          <div className="mt-auto flex w-full flex-1 flex-col items-center justify-center gap-4 pt-8">
            <button
              type="button"
              style={SESSION_ACTION_CIRCLE_STYLE}
              onClick={() => void confirmStartShift()}
              className={`${circleShell} gap-3 bg-emerald-600 text-xl shadow-[0_16px_40px_-10px_rgba(5,150,105,0.6)] ring-emerald-700/30 animate-session-pulse-green transition hover:brightness-105 active:brightness-95 sm:text-2xl`}
            >
              <span className="max-w-[14rem] px-1">אישור התחלת משמרת</span>
            </button>
            <p className="max-w-[14rem] text-center text-xs font-semibold text-[#001F3F]/90">Double-Shake</p>
          </div>
        </>
      ) : activeShiftRow ? (
        <>
          <div className="w-full space-y-2 text-center">
            <p className="text-sm font-semibold text-emerald-900">משמרת פעילה</p>
            <p className="text-4xl font-bold tabular-nums text-[#001F3F]">{liveTimerText}</p>
            <p className="text-sm font-semibold text-navy-800">סכום שנצבר: ₪{liveEarned}</p>
            <p className="mx-auto mt-2 max-w-xs text-xs text-slate-500">
              סיום המשמרת מתבצע מהצד של ההורה; כאן תופיע בקשת סיום לאישור.
            </p>
          </div>
          <div className="mt-auto flex flex-col items-center pt-8">
            <div
              style={SESSION_ACTION_CIRCLE_STYLE}
              className={`${circleShell} pointer-events-none gap-1 bg-[#FF8A8A] text-lg shadow-[0_10px_36px_-8px_rgba(255,138,138,0.75)] ring-[#FF8A8A]/40 sm:text-xl`}
              role="presentation"
            >
              <span className="max-w-[13rem] px-2 text-center font-bold leading-tight">
                ממתינים לסיום מההורה
              </span>
            </div>
            <p className="mt-3 max-w-[14rem] text-center text-xs font-semibold text-[#001F3F]/90">Double-Shake</p>
          </div>
        </>
      ) : (
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
          <p className="text-sm text-slate-600">אין משמרת פעילה כרגע.</p>
          <p className="text-xs text-slate-500">החליפו ל&quot;הורה&quot; כדי לפתוח משמרת, ואז חזרו לכאן.</p>
          <p className="mt-4 text-xs font-semibold text-[#001F3F]/80">Double-Shake</p>
        </div>
      )}
    </>
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

      <section className="space-y-3" aria-label="סיכום מהיר">
        <div className={insightCardClass}>
          <h2 className="text-sm font-bold text-navy-header">מפגשים קרובים</h2>
          <p className="mt-1 text-xs font-semibold text-emerald-800">{upcomingInsight.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{upcomingInsight.body}</p>
        </div>
        <div className={insightCardClass}>
          <h2 className="text-sm font-bold text-navy-header">הכנסות</h2>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[#001F3F]">
            {hasSessionForEarnings ? `₪${liveEarned}` : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {hasSessionForEarnings
              ? "מצטבר במשמרת הנוכחית (לפני אישורי סיום)."
              : "אין משמרת פעילה — סיכומי חודש וארנק מלא בהמשך."}
          </p>
          <Link
            href="/sitter/personal"
            className="mt-3 inline-block text-xs font-semibold text-emerald-800 underline decoration-emerald-700/50"
          >
            מעבר לארנק ותשלומים
          </Link>
        </div>
      </section>

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
            <span className="w-full text-right text-xs font-semibold leading-snug sm:text-sm">סשן ומשמרות</span>
          </Link>
        </div>
      </section>

      {profileCardStatus === "incomplete" ? (
        <section
          id="sitter-profile-details"
          className="rounded-3xl border border-navy-header/10 bg-white p-4 shadow-soft sm:p-5"
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

      <div
        ref={fabStackRef}
        className="pointer-events-none fixed z-[60] flex flex-col items-end gap-2"
        style={{
          right: "max(1rem, env(safe-area-inset-right, 0px))",
          bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))"
        }}
      >
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          {quickMenuOpen ? (
            <div
              role="menu"
              className="w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-navy-header/10 bg-white p-3 text-right shadow-sm shadow-[0_8px_28px_-6px_rgba(0,31,63,0.15)]"
            >
              <p className="border-b border-slate-100 pb-2 text-xs font-bold text-[#001F3F]">פעולות מהירות</p>
              <button
                type="button"
                role="menuitem"
                className="mt-2 w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
                onClick={() => {
                  scrollToQuickShift();
                }}
              >
                התחלת משמרת
              </button>
              <button
                type="button"
                role="menuitem"
                className="mt-2 flex w-full flex-row-reverse items-center justify-between gap-2 rounded-xl border border-navy-header/10 bg-[#FDFBF6] px-3 py-2.5 text-sm font-semibold text-navy-header transition hover:bg-white"
                onClick={() => {
                  toggleOpenForWork();
                  setQuickMenuOpen(false);
                }}
              >
                <span
                  className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${openForWork ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.35)]" : "bg-slate-300"}`}
                  aria-hidden
                />
                הוספת זמינות
              </button>
            </div>
          ) : null}
          <div className={openForWork ? "rounded-full p-0.5 shadow-[0_0_0_3px_rgba(52,211,153,0.45)]" : ""}>
            <FloatingActionButton
              label={quickMenuOpen ? "סגירת תפריט מהיר" : "התחלת משמרת או הוספת זמינות"}
              onClick={() => setQuickMenuOpen((o) => !o)}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
