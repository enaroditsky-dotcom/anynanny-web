"use client";

import Link from "next/link";
import { Calendar, History, Settings, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useSitterBillingSession } from "@/lib/billing/use-sitter-billing-session";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SESSION_ACTION_CIRCLE_STYLE } from "@/lib/session/session-circle";
import { SITTER_PROFILES_TABLE } from "@/lib/sitter/sitter-profile";

const circleShell =
  "rounded-full shrink-0 overflow-hidden ring-2 font-bold leading-tight text-white [border-radius:50%!important]";

export default function SitterDashboardPage() {
  const router = useRouter();
  const { displayName } = useAuth();
  const [profileGateOk, setProfileGateOk] = useState<boolean | null>(null);

  const {
    loading,
    sitterId,
    pendingRow,
    activeShiftRow,
    endPendingRow,
    liveTimerText,
    liveEarned,
    banner,
    setBanner,
    confirmingStart,
    confirmStartShift
  } = useSitterBillingSession();

  const firstName = useMemo(() => {
    const n = displayName?.trim();
    if (!n) return "";
    return n.split(/\s+/)[0] ?? "";
  }, [displayName]);

  useEffect(() => {
    if (loading) return;
    if (!sitterId) {
      setProfileGateOk(true);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setProfileGateOk(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from(SITTER_PROFILES_TABLE)
        .select("is_public")
        .eq("id", sitterId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn("[sitter dashboard] sitter_profiles:", error.message);
        router.replace("/auth/register?role=sitter");
        return;
      }
      if (!data || data.is_public !== true) {
        router.replace("/auth/register?role=sitter");
        return;
      }
      setProfileGateOk(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [sitterId, loading, router]);

  if (loading || profileGateOk !== true) {
    return (
      <main className="mx-auto flex min-h-[40vh] w-full max-w-md items-center justify-center bg-[#FDFBF6] py-10" dir="rtl">
        <p className="text-right text-sm text-slate-600">טוען…</p>
      </main>
    );
  }

  const sessionSection = (
    <>
      {endPendingRow ? (
        <>
          <div className="w-full space-y-2 text-right">
            <p className="text-sm font-semibold text-[#001F3F]">ההורה ביקש לסיים את המשמרת</p>
            <p className="text-4xl font-bold tabular-nums text-navy-header">{liveTimerText}</p>
            <p className="text-sm font-semibold text-navy-800">סכום שנצבר: ₪{liveEarned}</p>
            <p className="text-xs text-slate-500">ממתינים לאישור סיום סופי מההורה.</p>
          </div>
          <div className="mt-auto flex w-full flex-1 flex-col items-center justify-center gap-4 pt-8">
            <div
              style={SESSION_ACTION_CIRCLE_STYLE}
              className={`${circleShell} pointer-events-none gap-1 bg-[#FF8A8A] text-lg shadow-[0_10px_36px_-8px_rgba(255,138,138,0.75)] ring-[#FF8A8A]/40 sm:text-xl`}
              role="presentation"
            >
              <span className="max-w-[13rem] px-2 text-center font-bold leading-tight">
                ממתינים לאישור מההורה
              </span>
            </div>
          </div>
        </>
      ) : pendingRow ? (
        <>
          <div className="w-full space-y-2 text-right">
            <p className="text-sm font-semibold text-slate-700">משמרת חדשה ממתינה לאישור</p>
            <p className="text-xs text-slate-500">מזהה סשן: {String(pendingRow.id).slice(0, 8)}…</p>
            {pendingRow.hourly_rate ? (
              <p className="text-xs text-slate-500">תעריף: ₪{Number(pendingRow.hourly_rate).toFixed(0)}/שעה</p>
            ) : null}
          </div>
          <div className="mt-auto flex w-full flex-1 flex-col items-center justify-center gap-4 pt-8">
            <button
              type="button"
              style={SESSION_ACTION_CIRCLE_STYLE}
              disabled={confirmingStart}
              onClick={() => void confirmStartShift()}
              className={`${circleShell} gap-3 bg-emerald-600 text-xl shadow-[0_16px_40px_-10px_rgba(5,150,105,0.6)] ring-emerald-700/30 animate-session-pulse-green transition hover:brightness-105 active:brightness-95 disabled:opacity-80 sm:text-2xl`}
            >
              <span className="max-w-[14rem] px-1">אשר תחילת משמרת</span>
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
              סיום המשמרת מתבצע מהצד של ההורה; כאן תופיע בקשת סיום.
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
    <main
      className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-md flex-col space-y-5 bg-[#FDFBF6] py-2"
      dir="rtl"
    >
      <header className="text-right">
        <h1 className="text-xl font-bold leading-snug text-[#001F3F] sm:text-[1.35rem]">
          שלום{firstName ? `, ${firstName}` : ""}! לוח בייביסיטר
        </h1>
        <p className="mt-1 text-sm text-slate-600">Double-Shake — ריענון חי מהשרת.</p>
        <Link
          href="/auth/register?role=sitter"
          className="mt-2 inline-block text-xs font-semibold text-emerald-800 underline decoration-emerald-700/50"
        >
          עריכת פרופיל
        </Link>
      </header>

      {banner ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-right text-sm text-amber-900">{banner}</p>
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
            <span className="w-full text-right text-xs font-semibold leading-snug sm:text-sm">סשן ומשמרות</span>
          </Link>
        </div>
      </section>

      <section className="mt-1 flex min-h-[22rem] flex-1 flex-col rounded-3xl border-2 border-[#001F3F]/20 bg-white p-4 shadow-[0_16px_48px_-12px_rgba(0,31,63,0.45)] sm:p-6">
        {sessionSection}
      </section>
    </main>
  );
}
