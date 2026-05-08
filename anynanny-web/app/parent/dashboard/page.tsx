"use client";

import Link from "next/link";
import { Clock3, Search, Settings, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [sessionState, setSessionState] = useState<SessionProtocolState>({ status: "idle" });
  const [nowMs, setNowMs] = useState(Date.now());
  const [useSupabase, setUseSupabase] = useState(false);
  const [parentUserId, setParentUserId] = useState<string | null>(null);

  const syncFromStorage = useCallback(() => {
    setSessionState(readSessionState());
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    syncFromStorage(); // fallback/initial hydration
    const ticker = setInterval(() => setNowMs(Date.now()), 1000);
    const onStorage = (event: StorageEvent) => {
      if (event.key === "anynanny_payer_session_v1") syncFromStorage();
    };
    window.addEventListener("storage", onStorage);

    let channelCleanup: (() => void) | null = null;
    if (supabase) {
      void (async () => {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr || !authData.user) return;
        const userId = authData.user.id;
        setParentUserId(userId);
        localStorage.setItem("active_role", "parent");

        const { data: row, error: rowErr } = await supabase
          .from(SESSIONS_TABLE)
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!rowErr && row) {
          const mapped = mapSupabaseRowToProtocol(row as SupabaseSessionRow);
          if (mapped) {
            persistSessionState(mapped);
            setSessionState(mapped);
          }
        }
        setUseSupabase(true);

        const channel = supabase
          .channel(`parent-sessions-${userId}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: SESSIONS_TABLE, filter: `user_id=eq.${userId}` },
            (payload) => {
              const rowData = (payload.new || payload.old) as SupabaseSessionRow;
              const mapped = mapSupabaseRowToProtocol(rowData);
              if (mapped) {
                persistSessionState(mapped);
                setSessionState(mapped);
              }
            }
          )
          .subscribe();
        channelCleanup = () => {
          void supabase.removeChannel(channel);
        };
      })();
    }

    return () => {
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
    if (useSupabase && parentUserId) {
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        const startedAtIso = new Date().toISOString();
        const { data: row, error } = await supabase
          .from(SESSIONS_TABLE)
          .insert({
            user_id: parentUserId,
            status: "pending",
            start_time: startedAtIso
          })
          .select("*")
          .single();
        if (!error && row) {
          const mapped = mapSupabaseRowToProtocol(row as SupabaseSessionRow);
          if (mapped) {
            persistSessionState(mapped);
            setSessionState(mapped);
            setNowMs(mapped.parentStartedAtMs ?? Date.now());
            return;
          }
        }
      }
    }
    const startedAt = Date.now();
    const next: SessionProtocolState = {
      status: "parent_initiated",
      parentStartedAtMs: startedAt
    };
    persistSessionState(next);
    setSessionState(next);
    setNowMs(startedAt);
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
    sessionState.status === "active" ? "סיום" : sessionState.status === "parent_initiated" ? "ממתין..." : "להתחיל";

  return (
    <main className="mx-auto w-full max-w-md space-y-5 bg-[#FDFBF6] py-2" dir="rtl">
      <section className="rounded-3xl bg-white p-5 text-center shadow-soft">
        <h1 className="text-lg font-bold text-navy-header">סטטוס בייביסיטר</h1>
        {sessionState.status === "active" ? (
          <div className="mt-3">
            <p className="text-3xl font-bold tracking-wider text-navy-header">{timerText}</p>
            <p className="text-base font-semibold text-navy-800">סכום שנצבר: ₪{earnedNis}</p>
          </div>
        ) : sessionState.status === "parent_initiated" ? (
          <p className="mt-3 text-sm text-slate-600">ממתין לאישור הבייביסיטר...</p>
        ) : sessionState.status === "ended" ? (
          <div className="mt-3">
            <p className="text-sm text-slate-600">המשמרת הסתיימה</p>
            <p className="text-base font-semibold text-navy-800">זמן בייביסיטר: {timerText}</p>
            <p className="text-base font-semibold text-navy-800">לתשלום: ₪{(sessionState.finalAmountNis ?? 0).toFixed(2)}</p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-600">אין משמרת פעילה כרגע</p>
        )}

        <div className="mt-6 flex items-center justify-center">
          <button
            type="button"
            onClick={sessionState.status === "active" ? endSession : startSession}
            disabled={sessionState.status === "parent_initiated"}
            className={`flex h-[280px] w-[280px] items-center justify-center rounded-full text-5xl font-bold text-white shadow-soft transition ${
              sessionState.status === "active"
                ? "bg-[#FF8A8A] hover:brightness-105 active:brightness-95"
                : sessionState.status === "parent_initiated"
                  ? "cursor-not-allowed bg-slate-300"
                  : "bg-[#CFE8C8] hover:brightness-105 active:brightness-95"
            }`}
          >
            {primaryLabel}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Link href="/parent/search" className="flex min-h-28 flex-col items-center justify-center rounded-2xl bg-white p-4 text-navy-header shadow-soft">
          <Search className="h-7 w-7" />
          <span className="mt-2 text-sm font-semibold">חיפוש נני</span>
        </Link>
        <Link href="/parent/wallet" className="flex min-h-28 flex-col items-center justify-center rounded-2xl bg-white p-4 text-navy-header shadow-soft">
          <Wallet className="h-7 w-7" />
          <span className="mt-2 text-sm font-semibold">ארנק דיגיטלי</span>
        </Link>
        <button type="button" className="flex min-h-28 flex-col items-center justify-center rounded-2xl bg-white p-4 text-navy-header shadow-soft">
          <Clock3 className="h-7 w-7" />
          <span className="mt-2 text-sm font-semibold">היסטוריה</span>
        </button>
        <button type="button" className="flex min-h-28 flex-col items-center justify-center rounded-2xl bg-white p-4 text-navy-header shadow-soft">
          <Settings className="h-7 w-7" />
          <span className="mt-2 text-sm font-semibold">הגדרות</span>
        </button>
      </section>
    </main>
  );
}
