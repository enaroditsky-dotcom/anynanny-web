"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Calendar, Settings, Wallet } from "lucide-react";

const HOURLY_RATE = 50;
const SESSION_STATE_KEY = "anynanny_payer_session_v1";

type SessionProtocolState = {
  status: "idle" | "parent_initiated" | "active" | "ended";
  parentStartedAtMs?: number;
  endedAtMs?: number;
  finalElapsedSeconds?: number;
  finalAmountNis?: number;
};

function formatElapsed(seconds: number): string {
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${secs}`;
}

export default function SessionPage() {
  const [sessionState, setSessionState] = useState<SessionProtocolState>({ status: "idle" });
  const [nowMs, setNowMs] = useState(Date.now());
  const isStarted = sessionState.status === "active";

  const syncFromStorage = () => {
    const raw = localStorage.getItem(SESSION_STATE_KEY);
    if (!raw) {
      setSessionState({ status: "idle" });
      return;
    }
    try {
      setSessionState(JSON.parse(raw) as SessionProtocolState);
    } catch {
      setSessionState({ status: "idle" });
    }
  };

  useEffect(() => {
    syncFromStorage();
    const onStorage = (event: StorageEvent) => {
      if (event.key === SESSION_STATE_KEY) syncFromStorage();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (sessionState.status !== "active") return;
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionState.status]);

  const seconds = useMemo(() => {
    const startedAt = sessionState.parentStartedAtMs;
    if (!startedAt) return 0;
    if (sessionState.status === "active" || sessionState.status === "parent_initiated") {
      return Math.max(0, Math.floor((nowMs - startedAt) / 1000));
    }
    return sessionState.finalElapsedSeconds ?? 0;
  }, [nowMs, sessionState]);
  const timerText = useMemo(() => formatElapsed(seconds), [seconds]);
  const earnedMoney = useMemo(() => (seconds / 3600) * HOURLY_RATE, [seconds]);

  const updateState = (next: SessionProtocolState) => {
    localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(next));
    setSessionState(next);
  };

  const handleIdlePress = () => {
    window.alert("רק הורה יכול להתחיל משמרת. ממתינים להתחלה מצד ההורה.");
  };

  const handleConfirm = () => {
    if (sessionState.status !== "parent_initiated") return;
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
    sessionState.status === "parent_initiated" ? "אישור" : sessionState.status === "active" ? "פעיל" : "להתחיל";

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
