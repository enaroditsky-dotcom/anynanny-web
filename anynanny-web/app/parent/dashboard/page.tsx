"use client";

import Link from "next/link";
import { Calendar, History, Settings, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  HOURLY_RATE,
  SESSIONS_TABLE,
  type SessionProtocolState,
  type SupabaseSessionRow,
  formatElapsed,
  mapSupabaseRowToProtocol,
  persistSessionState,
  readSessionState
} from "@/lib/session/protocol";
import { getPairedSitterUserId } from "@/lib/session/paired-sitter";

export default function ParentDashboardPage() {
  const { isLoading: authLoading, displayName } = useAuth();

  /** getSession() can succeed when middleware getUser() misses — show grid as soon as we see a browser session. */
  const [clientHasSessionUser, setClientHasSessionUser] = useState<boolean | null>(null);

  const [sessionState, setSessionState] = useState<SessionProtocolState>({ status: "idle" });
  const [nowMs, setNowMs] = useState(Date.now());
  const [useSupabase, setUseSupabase] = useState(false);
  const [parentUserId, setParentUserId] = useState<string | null>(null);
  const [confirmStartOpen, setConfirmStartOpen] = useState(false);

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
    let channelCleanup: (() => void) | null = null;
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

        const channel = supabase.channel(`parent-sessions-${userId}`);
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: SESSIONS_TABLE, filter: `parent_id=eq.${userId}` },
          (payload) => {
            const rowData = (payload.new ?? payload.old) as SupabaseSessionRow | undefined;
            if (!rowData || typeof rowData !== "object") return;
            const mapped = mapSupabaseRowToProtocol(rowData);
            if (mapped) {
              persistSessionState(mapped);
              setSessionState(mapped);
            }
          }
        );
        channel.subscribe();
        channelCleanup = () => {
          void supabase.removeChannel(channel);
        };
      })();
    }

    return () => {
      cancelled = true;
      clearInterval(ticker);
      window.removeEventListener("storage", onStorage);
      if (channelCleanup) channelCleanup();
    };
  }, [syncFromStorage]);

  const elapsedSeconds = useMemo(() => {
    if (sessionState.status === "parent_initiated") return 0;
    const startedAt = sessionState.parentStartedAtMs;
    if (!startedAt) return 0;
    if (sessionState.status === "active") {
      const endWallMs =
        sessionState.endRequested && sessionState.parentEndRequestedAtMs
          ? sessionState.parentEndRequestedAtMs
          : nowMs;
      return Math.max(0, Math.floor((endWallMs - startedAt) / 1000));
    }
    return sessionState.finalElapsedSeconds ?? 0;
  }, [nowMs, sessionState]);

  const timerText = useMemo(() => formatElapsed(elapsedSeconds), [elapsedSeconds]);
  const earnedNis = useMemo(() => ((elapsedSeconds / 3600) * HOURLY_RATE).toFixed(2), [elapsedSeconds]);

  const startSession = async () => {
    if (sessionState.status === "parent_initiated" || sessionState.status === "active") return;

    const optimistic: SessionProtocolState = {
      status: "parent_initiated"
    };
    persistSessionState(optimistic);
    setSessionState(optimistic);
    setNowMs(Date.now());

    const supabase = getSupabaseBrowserClient();
    let uid = parentUserId;
    if (supabase && !uid) {
      const { data: authData } = await supabase.auth.getUser();
      uid = authData.user?.id ?? null;
      if (uid) setParentUserId(uid);
    }

    if (!supabase || !uid) {
      console.warn("[parent] Start session without Supabase auth — local-only (sitter sync requires login).");
      persistSessionState({ status: "idle" });
      setSessionState({ status: "idle" });
      return;
    }

    const pairedSitterId = getPairedSitterUserId();
    const { data: row, error } = await supabase
      .from(SESSIONS_TABLE)
      .insert({
        parent_id: uid,
        sitter_id: pairedSitterId,
        status: "pending",
        start_time: null
      })
      .select("*")
      .single();

    if (error) {
      console.error("[parent] Supabase insert session failed:", error.message);
      persistSessionState({ status: "idle" });
      setSessionState({ status: "idle" });
      window.alert(`לא ניתן לפתוח משמרת: ${error.message}`);
      return;
    }

    setUseSupabase(true);
    if (row) {
      const mapped = mapSupabaseRowToProtocol(row as SupabaseSessionRow);
      if (mapped) {
        persistSessionState(mapped);
        setSessionState(mapped);
        setNowMs(Date.now());
      }
    }
  };

  const endSession = async () => {
    if (sessionState.status === "parent_initiated") {
      window.alert("ממתין לאישור הבייביסיטר להתחלת המשמרת.");
      return;
    }
    if (sessionState.status !== "active" || !sessionState.parentStartedAtMs) return;
    if (sessionState.endRequested) {
      window.alert("כבר נשלחה בקשת סיום — ממתינים לאישור הבייביסיטר.");
      return;
    }
    const confirmed = window.confirm("לבקש סיום משמרת? הבייביסיטר יצטרך לאשר כדי לנעול את הסכום.");
    if (!confirmed) return;

    if (useSupabase && sessionState.supabaseSessionId) {
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        const reqAt = new Date().toISOString();
        const { data: row, error } = await supabase
          .from(SESSIONS_TABLE)
          .update({
            end_requested: true,
            parent_end_requested_at: reqAt
          })
          .eq("id", sessionState.supabaseSessionId)
          .select("*")
          .single();
        if (!error && row) {
          const mapped = mapSupabaseRowToProtocol(row as SupabaseSessionRow);
          if (mapped) {
            persistSessionState(mapped);
            setSessionState(mapped);
            return;
          }
        }
        if (error) {
          console.error("[parent] request end failed:", error.message);
          window.alert(`לא ניתן לשלוח בקשת סיום: ${error.message}`);
        }
      }
    }
  };

  const sessionRunning =
    sessionState.status === "active" || sessionState.status === "parent_initiated";

  const waitingNannyStart = sessionState.status === "parent_initiated";
  const waitingNannyEnd = sessionState.status === "active" && sessionState.endRequested;

  const showLoading =
    clientHasSessionUser !== true && (clientHasSessionUser === null || (clientHasSessionUser === false && authLoading));

  const onConfirmStartShift = async () => {
    setConfirmStartOpen(false);
    await startSession();
  };

  if (showLoading) {
    return (
      <main className="mx-auto flex min-h-[40vh] w-full max-w-md items-center justify-center bg-[#FDFBF6] py-10" dir="rtl">
        <p className="text-right text-sm text-slate-600">טוען…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md space-y-5 bg-[#FDFBF6] py-2" dir="rtl">
      <header className="text-right">
        <h1 className="text-xl font-bold leading-snug text-[#001F3F] sm:text-[1.35rem]">
          שלום{firstName ? `, ${firstName}` : ""}! מה תרצה לעשות היום?
        </h1>
      </header>

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

      <section className="rounded-3xl border-2 border-[#001F3F]/20 bg-white p-4 shadow-[0_16px_48px_-12px_rgba(0,31,63,0.45)] sm:p-6">
        {sessionRunning ? (
          <div className="mb-5 space-y-2 text-right">
            <p className="text-xs font-medium text-slate-600">
              {waitingNannyStart
                ? "ממתין לאישור הבייביסיטר…"
                : waitingNannyEnd
                  ? "ממתינים לאישור סיום מהבייביסיטר…"
                  : "משמרת פעילה"}
            </p>
            <p className="text-4xl font-bold tabular-nums tracking-wide text-[#001F3F]">{timerText}</p>
            <p className="text-sm font-semibold text-navy-800">סכום שנצבר: ₪{earnedNis}</p>
          </div>
        ) : null}

        {sessionState.status === "ended" ? (
          <div className="mb-5 space-y-1 text-right">
            <p className="text-xs text-slate-600">המשמרת האחרונה הסתיימה</p>
            <p className="text-lg font-semibold tabular-nums text-navy-header">{timerText}</p>
          </div>
        ) : null}

        {sessionRunning && sessionState.status === "active" && !waitingNannyEnd ? (
          <button
            type="button"
            onClick={() => void endSession()}
            className="w-full rounded-2xl bg-[#FF8A8A] py-4 text-lg font-bold text-white shadow-[0_8px_28px_-6px_rgba(255,138,138,0.65)] transition hover:brightness-105 active:brightness-95"
          >
            סיום משמרת
          </button>
        ) : sessionRunning && (waitingNannyStart || waitingNannyEnd) ? (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 py-4 text-right text-sm font-semibold text-slate-600">
            {waitingNannyStart ? "ממתין לאישור הבייביסיטר…" : "ממתינים לאישור סיום מהבייביסיטר…"}
          </p>
        ) : !sessionRunning ? (
          <div className="flex w-full justify-center">
            <button
              type="button"
              onClick={() => setConfirmStartOpen(true)}
              className="relative flex aspect-square h-64 w-64 shrink-0 flex-col items-center justify-center rounded-[9999px] bg-[#001F3F] px-5 text-center text-lg font-bold leading-snug text-white shadow-[0_12px_40px_-10px_rgba(0,31,63,0.65)] ring-2 ring-[#001F3F]/30 animate-session-pulse-navy transition-all duration-300 hover:brightness-110 active:scale-[0.99]"
            >
              <span className="block max-w-[13rem]">
                התחלת משמרת
                <span className="mt-1 block text-sm font-semibold opacity-90">(Double-Shake)</span>
              </span>
            </button>
          </div>
        ) : null}
      </section>

      {confirmStartOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="presentation"
          onClick={() => setConfirmStartOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-shift-title"
            className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <h2 id="confirm-shift-title" className="text-right text-lg font-bold text-[#001F3F]">
              האם להתחיל את ספירת הזמן עכשיו?
            </h2>
            <div className="mt-6 flex flex-row-reverse gap-3">
              <button
                type="button"
                className="flex-1 rounded-2xl bg-[#001F3F] py-3 text-sm font-semibold text-white shadow-soft transition hover:brightness-105"
                onClick={() => void onConfirmStartShift()}
              >
                אישור
              </button>
              <button
                type="button"
                className="flex-1 rounded-2xl border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={() => setConfirmStartOpen(false)}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
