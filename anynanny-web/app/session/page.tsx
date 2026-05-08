"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Calendar, Settings, Wallet } from "lucide-react";

const HOURLY_RATE = 50;
const ACTIVE_SESSION_START_KEY = "active_session_start_time";

function formatElapsed(seconds: number): string {
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${secs}`;
}

export default function SessionPage() {
  const [startTimeMs, setStartTimeMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const isStarted = startTimeMs !== null;

  useEffect(() => {
    const raw = localStorage.getItem(ACTIVE_SESSION_START_KEY);
    if (!raw) return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      setStartTimeMs(parsed);
      setNowMs(Date.now());
    }
  }, []);

  useEffect(() => {
    if (!isStarted) return;
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [isStarted]);

  const seconds = useMemo(() => {
    if (!startTimeMs) return 0;
    return Math.max(0, Math.floor((nowMs - startTimeMs) / 1000));
  }, [nowMs, startTimeMs]);
  const timerText = useMemo(() => formatElapsed(seconds), [seconds]);
  const earnedMoney = useMemo(() => (seconds / 3600) * HOURLY_RATE, [seconds]);

  const handleStart = () => {
    const startedAt = Date.now();
    localStorage.setItem(ACTIVE_SESSION_START_KEY, String(startedAt));
    setStartTimeMs(startedAt);
    setNowMs(startedAt);
  };

  const handleEnd = () => {
    const approved = window.confirm("לסיים את המשמרת?");
    if (!approved) return;
    localStorage.removeItem(ACTIVE_SESSION_START_KEY);
    setStartTimeMs(null);
    setNowMs(Date.now());
  };

  return (
    <main className="min-h-[100dvh] bg-[#FDFBF6] px-4 pb-6 pt-4" dir="rtl">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <section className="rounded-3xl bg-white px-5 py-8 text-center shadow-soft">
          <p className="text-5xl font-bold tracking-wider text-navy-header">{timerText}</p>
          <p className="mt-3 text-lg font-semibold text-navy-800">סכום שנצבר: ₪{earnedMoney.toFixed(2)}</p>

          <div className="mt-8 flex items-center justify-center">
            {isStarted ? (
              <button
                className="flex h-[280px] w-[280px] items-center justify-center rounded-full bg-[#FF8A8A] text-5xl font-bold text-white shadow-soft transition hover:brightness-105 active:brightness-95"
                onClick={handleEnd}
              >
                סיום
              </button>
            ) : (
              <button
                className="flex h-[280px] w-[280px] flex-col items-center justify-center gap-3 rounded-full bg-[#CFE8C8] text-white shadow-soft transition hover:brightness-105 active:brightness-95"
                onClick={handleStart}
              >
                <span className="relative h-16 w-16 overflow-hidden rounded-full border border-white/70 bg-white/70">
                  <Image src="/logo.png" alt="" fill className="object-cover object-center" />
                </span>
                <span className="text-5xl font-bold">להתחיל</span>
              </button>
            )}
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
