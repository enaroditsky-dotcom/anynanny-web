"use client";

import Link from "next/link";
import { Calendar, History, Settings, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  HOURLY_RATE,
  SESSIONS_TABLE,
  SESSION_STATUS_CANCELLED,
  SESSION_STATUS_PENDING_SITTER_APPROVAL,
  computeLiveElapsedSecondsActive,
  type SessionProtocolState,
  type SupabaseSessionRow,
  formatElapsed,
  mapSupabaseRowToProtocol,
  persistSessionState,
  readSessionState
} from "@/lib/session/protocol";
import { SESSION_ACTION_CIRCLE_STYLE } from "@/lib/session/session-circle";
import { getPairedSitterUserId } from "@/lib/session/paired-sitter";
import { friendlySupabaseSessionError } from "@/lib/session/supabase-errors";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";

const circleShell =
  "rounded-full shrink-0 overflow-hidden ring-2 text-lg font-bold leading-tight text-white sm:text-xl [border-radius:50%!important]";

export default function ParentDashboardPage() {
  const { isLoading: authLoading, displayName } = useAuth();

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

  useEffect(() => {
    if (!debugToast) return;
    const t = window.setTimeout(() => setDebugToast(null), 3800);
    return () => window.clearTimeout(t);
  }, [debugToast]);

  const firstName = useMemo(() => {
    const n = displayName?.trim();
    if (!n) return "";
    return n.split(/\s+/)[0] ?? "";
  }, [displayName]);

  const syncFromStorage = useCallback(() => {
    try {
      setSessionState(readSessionState());
    } catch {
      setSessionState({ status: "idle" });
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setClientHasSessionUser(false);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      setClientHasSessionUser(!!data.session?.user);
    });
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    syncFromStorage();
    const ticker = setInterval(() => setNowMs(Date.now()), 1000);
    const onStorage = (event: StorageEvent) => {
      if (event.key === "anynanny_payer_session_v1") syncFromStorage();
    };
    window.addEventListener("storage", onStorage);

    let cancelled = false;
    if (supabase) {
      void (async () => {
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

        const { data: row, error: rowErr } = await supabase
          .from(SESSIONS_TABLE)
          .select("*")
          .eq("parent_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (rowErr) {
          console.warn("[parent] initial sessions fetch:", rowErr.message);
        }
        if (!cancelled && !rowErr && row) {
          const mapped = mapSupabaseRowToProtocol(row as SupabaseSessionRow);
          if (mapped) {
            persistSessionState(mapped);
            setSessionState(mapped);
          }
        }
        if (cancelled) return;

        setUseSupabase(true);
      })();
    }

    return () => {
      cancelled = true;
      clearInterval(ticker);
      window.removeEventListener("storage", onStorage);
    };
  }, [syncFromStorage]);

  /** Prefer row id when known so parent_end_requested_at updates arrive instantly for that session. */
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !parentUserId) return;

    const sid = sessionState.supabaseSessionId;
    const filter = sid ? `id=eq.${sid}` : `parent_id=eq.${parentUserId}`;
    const channel = supabase.channel(`parent-session-rt-${parentUserId}-${sid ?? "none"}`);
    const handler = (payload: {
      new?: Record<string, unknown>;
      old?: Record<string, unknown>;
    }) => {
      const rowData = (payload.new ?? payload.old) as SupabaseSessionRow | undefined;
      if (!rowData || typeof rowData !== "object") return;
      const mapped = mapSupabaseRowToProtocol(rowData);
      if (mapped) {
        persistSessionState(mapped);
        setSessionState(mapped);
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
  }, [parentUserId, sessionState.supabaseSessionId]);

  const elapsedSeconds = useMemo(() => {
    if (sessionState.status === "parent_initiated") return 0;
    const startedAt = sessionState.parentStartedAtMs;
    if (!startedAt) return 0;
    if (sessionState.status === "active") {
      return computeLiveElapsedSecondsActive({
        startMs: startedAt,
        parentEndRequestedAtMs: sessionState.parentEndRequestedAtMs ?? null,
        nowMs
      });
    }
    return sessionState.finalElapsedSeconds ?? 0;
  }, [nowMs, sessionState]);

  const timerText = useMemo(() => formatElapsed(elapsedSeconds), [elapsedSeconds]);
  const earnedNis = useMemo(() => ((elapsedSeconds / 3600) * HOURLY_RATE).toFixed(2), [elapsedSeconds]);

  const startSession = async () => {
    if (sessionState.status === "parent_initiated" || sessionState.status === "active") return;

    const auth = await resolveBrowserAuth();
    if (!auth.ok) {
      setDbBanner(auth.reason === "no_client" ? "Supabase לא מוגדר." : "יש להתחבר כדי לפתוח משמרת.");
      return;
    }

    const optimistic: SessionProtocolState = {
      status: "parent_initiated"
    };
    persistSessionState(optimistic);
    setSessionState(optimistic);
    setNowMs(Date.now());
    setParentUserId(auth.userId);

    const pairedSitterId = getPairedSitterUserId();
    try {
      const { data: row, error } = await auth.supabase
        .from(SESSIONS_TABLE)
        .insert({
          parent_id: auth.userId,
          sitter_id: pairedSitterId,
          status: SESSION_STATUS_PENDING_SITTER_APPROVAL,
          start_time: null
        })
        .select("*")
        .single();

      if (error) {
        console.error("[parent] Supabase insert session failed:", error.message);
        persistSessionState({ status: "idle" });
        setSessionState({ status: "idle" });
        setDbBanner(friendlySupabaseSessionError(error));
        return;
      }

      setUseSupabase(true);
      if (row) {
        const mapped = mapSupabaseRowToProtocol(row as SupabaseSessionRow);
        if (mapped) {
          persistSessionState(mapped);
          setSessionState(mapped);
          setNowMs(Date.now());
          setDebugToast("Request sent to Sitter");
        }
      }
    } catch (e) {
      console.error("[parent] startSession:", e);
      persistSessionState({ status: "idle" });
      setSessionState({ status: "idle" });
      setDbBanner(friendlySupabaseSessionError(e));
    }
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
        const { data: row, error } = await auth.supabase
          .from(SESSIONS_TABLE)
          .update({ parent_end_requested_at: reqAt })
          .eq("id", sessionState.supabaseSessionId)
          .select("*")
          .single();
        if (!error && row) {
          const mapped = mapSupabaseRowToProtocol(row as SupabaseSessionRow);
          if (mapped) {
            persistSessionState(mapped);
            setSessionState(mapped);
            setDbBanner(null);
            setDebugToast("Request sent to Sitter");
            return;
          }
        }
        if (error) {
          console.error("[parent] request end failed:", error.message);
          setDbBanner(friendlySupabaseSessionError(error));
        }
      } catch (e) {
        console.error("[parent] endSession:", e);
        setDbBanner(friendlySupabaseSessionError(e));
      }
    }
  };

  const sessionRunning =
    sessionState.status === "active" || sessionState.status === "parent_initiated";

  const waitingNannyStart = sessionState.status === "parent_initiated";
  const waitingNannyEnd =
    sessionState.status === "active" && sessionState.parentEndRequestedAtMs != null;

  const showLoading =
    clientHasSessionUser !== true && (clientHasSessionUser === null || (clientHasSessionUser === false && authLoading));

  if (showLoading) {
    return (
      <main className="mx-auto flex min-h-[40vh] w-full max-w-md items-center justify-center bg-[#FDFBF6] py-10" dir="rtl">
        <p className="text-right text-sm text-slate-600">טוען…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-md flex-col space-y-5 bg-[#FDFBF6] py-2" dir="rtl">
      <header className="text-right">
        <h1 className="text-xl font-bold leading-snug text-[#001F3F] sm:text-[1.35rem]">
          שלום{firstName ? `, ${firstName}` : ""}! מה תרצה לעשות היום?
        </h1>
      </header>

      {dbBanner ? (
        <div
          role="status"
          className="flex flex-row-reverse items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-right text-sm text-amber-950"
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

      <section className="rounded-3xl bg-white p-4 shadow-soft sm:p-5">
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
      </section>

      <section className="mt-1 flex min-h-0 flex-1 flex-col items-center rounded-3xl border-2 border-[#001F3F]/20 bg-white p-4 shadow-[0_16px_48px_-12px_rgba(0,31,63,0.45)] sm:p-6">
        {sessionRunning ? (
          <div className="w-full space-y-2 text-right">
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

        {sessionState.status === "ended" ? (
          <div className="w-full space-y-1 text-right">
            <p className="text-xs text-slate-600">המשמרת האחרונה הסתיימה</p>
            <p className="text-lg font-semibold tabular-nums text-navy-header">{timerText}</p>
          </div>
        ) : null}

        <div className="mt-auto flex w-full flex-1 flex-col items-center justify-center gap-4 pt-8">
          {!sessionRunning ? (
            <button
              type="button"
              style={SESSION_ACTION_CIRCLE_STYLE}
              onClick={() => void startSession()}
              className={`${circleShell} gap-1 bg-[#001F3F] shadow-[0_12px_40px_-10px_rgba(0,31,63,0.65)] ring-[#001F3F]/25 transition hover:brightness-110 active:brightness-95`}
            >
              <span className="max-w-[13rem]">התחלת משמרת</span>
              <span className="max-w-[13rem] text-base font-semibold opacity-90">Double-Shake</span>
            </button>
          ) : waitingNannyStart ? (
            <>
              <button
                type="button"
                style={SESSION_ACTION_CIRCLE_STYLE}
                disabled={cancelBusy}
                className={`${circleShell} cursor-wait gap-2 bg-[#001F3F] opacity-95 shadow-[0_12px_40px_-10px_rgba(0,31,63,0.65)] ring-[#001F3F]/30 animate-session-pulse-navy transition disabled:cursor-not-allowed disabled:opacity-70`}
              >
                <span className="max-w-[13rem]">ממתין לאישור…</span>
              </button>
              <button
                type="button"
                disabled={cancelBusy}
                onClick={() => void cancelSession()}
                className="rounded-xl border border-rose-300/90 bg-rose-50/50 px-4 py-2.5 text-sm font-semibold text-rose-800 shadow-sm transition hover:border-rose-400 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cancelBusy ? "מבטלים…" : "ביטול הבקשה"}
              </button>
            </>
          ) : sessionState.status === "active" && !waitingNannyEnd ? (
            <button
              type="button"
              style={SESSION_ACTION_CIRCLE_STYLE}
              onClick={() => void endSession()}
              className={`${circleShell} gap-1 bg-[#FF8A8A] shadow-[0_10px_36px_-8px_rgba(255,138,138,0.75)] ring-[#FF8A8A]/40 transition hover:brightness-105 active:brightness-95`}
            >
              <span className="max-w-[13rem]">סיום משמרת</span>
            </button>
          ) : waitingNannyEnd ? (
            <button
              type="button"
              style={SESSION_ACTION_CIRCLE_STYLE}
              disabled
              className={`${circleShell} cursor-wait gap-2 bg-[#FF8A8A] shadow-[0_10px_36px_-8px_rgba(255,138,138,0.65)] ring-[#FF8A8A]/35 animate-session-pulse-salmon`}
            >
              <span className="max-w-[13rem]">ממתין לאישור סיום...</span>
            </button>
          ) : null}
        </div>
      </section>

      {debugToast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 left-1/2 z-[100] max-w-[min(90vw,20rem)] -translate-x-1/2 rounded-2xl bg-emerald-800 px-5 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-emerald-900/25"
        >
          {debugToast}
        </div>
      ) : null}
    </main>
  );
}
