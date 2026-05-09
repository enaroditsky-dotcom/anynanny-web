"use client";

import Link from "next/link";
import { Calendar, Settings, Wallet } from "lucide-react";
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

export default function ParentDashboardPage() {
  const { isLoading: authLoading } = useAuth();

  const [sessionState, setSessionState] = useState<SessionProtocolState>({ status: "idle" });
  const [nowMs, setNowMs] = useState(Date.now());
  const [useSupabase, setUseSupabase] = useState(false);
  const [parentUserId, setParentUserId] = useState<string | null>(null);

  const syncFromStorage = useCallback(() => {
    try {
      setSessionState(readSessionState());
    } catch {
      setSessionState({ status: "idle" });
    }
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
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr || !authData.user) return;
        const userId = authData.user.id;
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
    const startedAt = sessionState.parentStartedAtMs;
    if (!startedAt) return 0;
    if (sessionState.status === "active" || sessionState.status === "parent_initiated") {
      return Math.max(0, Math.floor((nowMs - startedAt) / 1000));
    }
    return sessionState.finalElapsedSeconds ?? 0;
  }, [nowMs, sessionState]);

  const timerText = useMemo(() => formatElapsed(elapsedSeconds), [elapsedSeconds]);
  const earnedNis = useMemo(() => ((elapsedSeconds / 3600) * HOURLY_RATE).toFixed(2), [elapsedSeconds]);

  const startSession = async () => {
    if (sessionState.status === "parent_initiated" || sessionState.status === "active") return;

    const startedAt = Date.now();
    const optimistic: SessionProtocolState = {
      status: "parent_initiated",
      parentStartedAtMs: startedAt
    };
    persistSessionState(optimistic);
    setSessionState(optimistic);
    setNowMs(startedAt);

    const supabase = getSupabaseBrowserClient();
    let uid = parentUserId;
    if (supabase && !uid) {
      const { data: authData } = await supabase.auth.getUser();
      uid = authData.user?.id ?? null;
      if (uid) setParentUserId(uid);
    }

    if (!supabase || !uid) {
      console.warn("[parent] Start session without Supabase auth — local-only (sitter sync requires login).");
      return;
    }

    const startedAtIso = new Date(startedAt).toISOString();
    const { data: row, error } = await supabase
      .from(SESSIONS_TABLE)
      .insert({
        parent_id: uid,
        status: "pending",
        start_time: startedAtIso
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
        setNowMs(mapped.parentStartedAtMs ?? Date.now());
      }
    }
  };

  const endSession = async () => {
    if (sessionState.status !== "active" || !sessionState.parentStartedAtMs) return;
    const confirmed = window.confirm("לסיים משמרת ולנעול סכום סופי?");
    if (!confirmed) return;
    const finalSeconds = Math.max(0, Math.floor((Date.now() - sessionState.parentStartedAtMs) / 1000));
    if (useSupabase && sessionState.supabaseSessionId) {
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        const { data: row, error } = await supabase
          .from(SESSIONS_TABLE)
          .update({
            status: "completed",
            end_time: new Date().toISOString(),
            final_elapsed_seconds: finalSeconds,
            final_amount_nis: Number(((finalSeconds / 3600) * HOURLY_RATE).toFixed(2))
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
      }
    }
    const next: SessionProtocolState = {
      status: "ended",
      parentStartedAtMs: sessionState.parentStartedAtMs,
      endedAtMs: Date.now(),
      finalElapsedSeconds: finalSeconds,
      finalAmountNis: Number(((finalSeconds / 3600) * HOURLY_RATE).toFixed(2))
    };
    persistSessionState(next);
    setSessionState(next);
  };

  const primaryLabel =
    sessionState.status === "active"
      ? "סיום"
      : sessionState.status === "parent_initiated"
        ? "ממתין…"
        : "להתחיל";

  const primaryTextClass =
    sessionState.status === "parent_initiated" ? "text-lg leading-tight px-2" : "text-3xl";

  if (authLoading) {
    return (
      <main className="mx-auto flex min-h-[40vh] w-full max-w-md items-center justify-center bg-[#FDFBF6] py-10" dir="rtl">
        <p className="text-sm text-slate-600">טוען…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md bg-[#FDFBF6] py-2" dir="rtl">
      <section className="rounded-3xl bg-white p-4 shadow-soft sm:p-5">
        <h1 className="text-center text-lg font-bold tracking-tight text-navy-header">ברוך הבא לדשבורד הורים</h1>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Link
            href="/parent/calendar"
            className="group flex min-h-[7.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 p-4 text-navy-header shadow-sm transition hover:border-navy-header/25 hover:shadow-md active:scale-[0.98]"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-navy-header/10">
              <Calendar className="h-7 w-7 stroke-[1.75]" aria-hidden />
            </span>
            <span className="text-sm font-semibold">יומן</span>
          </Link>

          <Link
            href="/parent/wallet"
            className="group flex min-h-[7.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 p-4 text-navy-header shadow-sm transition hover:border-navy-header/25 hover:shadow-md active:scale-[0.98]"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-navy-header/10">
              <Wallet className="h-7 w-7 stroke-[1.75]" aria-hidden />
            </span>
            <span className="text-sm font-semibold">ארנק</span>
          </Link>

          <Link
            href="/parent/settings"
            className="group flex min-h-[7.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 p-4 text-navy-header shadow-sm transition hover:border-navy-header/25 hover:shadow-md active:scale-[0.98]"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-navy-header/10">
              <Settings className="h-7 w-7 stroke-[1.75]" aria-hidden />
            </span>
            <span className="text-sm font-semibold">הגדרות</span>
          </Link>

          <div className="flex min-h-[7.5rem] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-[#001F3F]/20 bg-gradient-to-b from-white to-[#FDFBF6] p-3 shadow-soft">
            <span className="text-xs font-semibold text-navy-header">התחלת סשן</span>

            {sessionState.status === "active" ? (
              <div className="mb-1 w-full space-y-0.5 text-center">
                <p className="text-lg font-bold tabular-nums text-navy-header">{timerText}</p>
                <p className="text-[11px] font-medium text-navy-800">₪{earnedNis}</p>
              </div>
            ) : null}
            {sessionState.status === "ended" ? (
              <div className="mb-1 w-full space-y-0.5 text-center">
                <p className="text-[11px] text-slate-600">הושלם</p>
                <p className="text-sm font-semibold text-navy-800">{timerText}</p>
              </div>
            ) : null}

            <button
              type="button"
              onClick={sessionState.status === "active" ? endSession : startSession}
              disabled={sessionState.status === "parent_initiated"}
              className={`flex h-[9.5rem] w-[9.5rem] max-w-full shrink-0 items-center justify-center rounded-full font-bold text-white shadow-lg transition sm:h-[10.5rem] sm:w-[10.5rem] ${
                sessionState.status === "active"
                  ? "bg-[#FF8A8A] hover:brightness-105 active:brightness-95"
                  : sessionState.status === "parent_initiated"
                    ? "cursor-not-allowed bg-slate-400"
                    : "bg-[#CFE8C8] hover:brightness-105 active:brightness-95"
              } ${primaryTextClass}`}
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
