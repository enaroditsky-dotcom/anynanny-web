"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Calendar, Settings, Wallet } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  HOURLY_RATE,
  SESSIONS_TABLE,
  SESSION_PENDING_START_STATUSES,
  type SessionProtocolState,
  type SupabaseSessionRow,
  formatElapsed,
  mapSupabaseRowToProtocol,
  persistSessionState,
  readSessionState
} from "@/lib/session/protocol";

export default function SessionPage() {
  const [sessionState, setSessionState] = useState<SessionProtocolState>({ status: "idle" });
  const [nowMs, setNowMs] = useState(Date.now());
  const [useSupabase, setUseSupabase] = useState(false);

  const syncFromStorage = () => {
    setSessionState(readSessionState());
  };

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    syncFromStorage();

    let cancelled = false;
    let channelCleanup: (() => void) | null = null;

    if (supabase) {
      void (async () => {
        const { data: row, error: fetchErr } = await supabase
          .from(SESSIONS_TABLE)
          .select("*")
          .in("status", [...SESSION_PENDING_START_STATUSES, "active", "completed"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fetchErr) {
          console.warn("[session] initial sessions fetch:", fetchErr.message);
        }
        if (!cancelled && row && !fetchErr) {
          const mapped = mapSupabaseRowToProtocol(row as SupabaseSessionRow);
          if (mapped) {
            persistSessionState(mapped);
            setSessionState(mapped);
          }
        }
        if (cancelled) return;

        setUseSupabase(true);

        // Register .on() handlers before .subscribe() (required by Supabase Realtime).
        const channel = supabase.channel("sitter-sessions");
        channel.on("postgres_changes", { event: "*", schema: "public", table: SESSIONS_TABLE }, (payload) => {
          const rowData = (payload.new ?? payload.old) as SupabaseSessionRow | undefined;
          if (!rowData || typeof rowData !== "object") return;
          const mapped = mapSupabaseRowToProtocol(rowData);
          if (!mapped) return;
          persistSessionState(mapped);
          setSessionState(mapped);
        });
        channel.subscribe();
        channelCleanup = () => {
          void supabase.removeChannel(channel);
        };
      })();
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === "anynanny_payer_session_v1") syncFromStorage();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      if (channelCleanup) channelCleanup();
    };
  }, []);

  useEffect(() => {
    if (sessionState.status !== "active") return;
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionState.status]);

  const seconds = useMemo(() => {
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
  const timerText = useMemo(() => formatElapsed(seconds), [seconds]);
  const earnedMoney = useMemo(() => (seconds / 3600) * HOURLY_RATE, [seconds]);

  const updateState = (next: SessionProtocolState) => {
    persistSessionState(next);
    setSessionState(next);
  };

  const handleIdlePress = () => {
    window.alert("רק הורה יכול להתחיל משמרת. ממתינים להתחלה מצד ההורה.");
  };

  const handleConfirm = async () => {
    if (sessionState.status !== "parent_initiated") return;
    if (useSupabase && sessionState.supabaseSessionId) {
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (!user) {
          window.alert("יש להתחבר כדי לאשר משמרת.");
          return;
        }
        const { data: row, error } = await supabase
          .from(SESSIONS_TABLE)
          .update({
            status: "active",
            sitter_id: user.id,
            start_time: new Date().toISOString(),
            start_confirmed: true
          })
          .eq("id", sessionState.supabaseSessionId)
          .select("*")
          .single();
        if (!error && row) {
          const mapped = mapSupabaseRowToProtocol(row as SupabaseSessionRow);
          if (mapped) {
            updateState(mapped);
            return;
          }
        }
        if (error) {
          console.error("[session] confirm update:", error.message);
        }
      }
    }
    const next: SessionProtocolState = {
      ...sessionState,
      status: "active"
    };
    updateState(next);
  };

  const statusHint =
    sessionState.status === "parent_initiated"
      ? "הורה התחיל משמרת — לחצי אישור כדי להפעיל טיימר משותף."
      : sessionState.status === "active"
        ? "המשמרת פעילה. סיום מתבצע מצד ההורה בלבד."
        : sessionState.status === "ended"
          ? "המשמרת הסתיימה ומחיר סופי ננעל."
          : "ממתינים שהורה יתחיל משמרת.";

  const circleLabel =
    sessionState.status === "parent_initiated"
      ? "אישור התחלה"
      : sessionState.status === "active"
        ? "פעיל"
        : "להתחיל";

  const circleClass =
    sessionState.status === "active"
      ? "bg-[#FF8A8A]"
      : sessionState.status === "parent_initiated"
        ? "bg-[#CFE8C8]"
        : "bg-[#CFE8C8]";

  const circleAction =
    sessionState.status === "parent_initiated" ? handleConfirm : sessionState.status === "active" ? undefined : handleIdlePress;
  const circleDisabled = sessionState.status === "active";

  const showLive = sessionState.status === "active";
  const showFinal = sessionState.status === "ended";

  const finalAmount = (sessionState.finalAmountNis ?? 0).toFixed(2);
  const finalDuration = formatElapsed(sessionState.finalElapsedSeconds ?? 0);

  const handleEnd = () => {
    const approved = window.confirm("לסיים את המשמרת?");
    if (!approved) return;
    const next: SessionProtocolState = {
      status: "idle"
    };
    updateState(next);
    setNowMs(Date.now());
  };

  return (
    <main className="min-h-[100dvh] bg-[#FDFBF6] px-4 pb-6 pt-4" dir="rtl">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <section className="rounded-3xl bg-white px-5 py-8 text-center shadow-soft">
          {showLive ? <p className="text-5xl font-bold tracking-wider text-navy-header">{timerText}</p> : null}
          {showLive ? <p className="mt-3 text-lg font-semibold text-navy-800">סכום שנצבר: ₪{earnedMoney.toFixed(2)}</p> : null}
          {showFinal ? (
            <div className="space-y-1">
              <p className="text-2xl font-bold text-navy-header">סיכום משמרת</p>
              <p className="text-sm text-slate-600">זמן עבודה כולל: {finalDuration}</p>
              <p className="text-base font-semibold text-navy-800">הרווחת: ₪{finalAmount}</p>
              <button
                type="button"
                className="mt-3 inline-flex items-center justify-center rounded-xl bg-[#001F3F] px-4 py-2 text-sm font-semibold text-white"
                onClick={handleEnd}
              >
                אישור
              </button>
            </div>
          ) : null}
          <p className="mt-3 text-sm text-slate-600">{statusHint}</p>

          <div className="mt-8 flex items-center justify-center">
            <button
              className={`flex h-[280px] w-[280px] flex-col items-center justify-center gap-3 rounded-full text-white shadow-soft transition hover:brightness-105 active:brightness-95 ${circleClass}`}
              onClick={circleAction}
              disabled={circleDisabled}
            >
              <span className="relative h-16 w-16 overflow-hidden rounded-full border border-white/70 bg-white/70">
                <Image src="/logo.png" alt="" fill className="object-cover object-center" />
              </span>
              <span className="text-5xl font-bold">{circleLabel}</span>
            </button>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-3 shadow-soft">
          <div className="grid grid-cols-3 gap-3">
            <button className="flex aspect-square flex-col items-center justify-center rounded-xl bg-[#F8FAFC] p-3 text-navy-header transition hover:bg-white">
              <Calendar className="h-6 w-6" />
              <span className="mt-2 text-sm font-semibold">יומן</span>
            </button>
            <button className="flex aspect-square flex-col items-center justify-center rounded-xl bg-[#F8FAFC] p-3 text-navy-header transition hover:bg-white">
              <Wallet className="h-6 w-6" />
              <span className="mt-2 text-sm font-semibold">ארנק</span>
            </button>
            <button className="flex aspect-square flex-col items-center justify-center rounded-xl bg-[#F8FAFC] p-3 text-navy-header transition hover:bg-white">
              <Settings className="h-6 w-6" />
              <span className="mt-2 text-sm font-semibold">הגדרות</span>
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
