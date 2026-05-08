"use client";

import Link from "next/link";
import { Clock3, Search, Settings, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

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

function readSessionState(): SessionProtocolState {
  const raw = localStorage.getItem(SESSION_STATE_KEY);
  if (!raw) return { status: "idle" };
  try {
    return JSON.parse(raw) as SessionProtocolState;
  } catch {
    return { status: "idle" };
  }
}

function persistSessionState(next: SessionProtocolState) {
  localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(next));
}

export default function ParentDashboardPage() {
  const [sessionState, setSessionState] = useState<SessionProtocolState>({ status: "idle" });
  const [nowMs, setNowMs] = useState(Date.now());

  const syncFromStorage = useCallback(() => {
    setSessionState(readSessionState());
  }, []);

  useEffect(() => {
    syncFromStorage();
    const ticker = setInterval(() => setNowMs(Date.now()), 1000);
    const onStorage = (event: StorageEvent) => {
      if (event.key === SESSION_STATE_KEY) syncFromStorage();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      clearInterval(ticker);
      window.removeEventListener("storage", onStorage);
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

  const startSession = () => {
    const startedAt = Date.now();
    const next: SessionProtocolState = {
      status: "parent_initiated",
      parentStartedAtMs: startedAt
    };
    persistSessionState(next);
    setSessionState(next);
    setNowMs(startedAt);
  };

  const endSession = () => {
    if (sessionState.status !== "active" || !sessionState.parentStartedAtMs) return;
    const confirmed = window.confirm("לסיים משמרת ולנעול סכום סופי?");
    if (!confirmed) return;
    const finalSeconds = Math.max(0, Math.floor((Date.now() - sessionState.parentStartedAtMs) / 1000));
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
