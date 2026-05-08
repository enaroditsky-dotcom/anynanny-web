"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Calendar, Settings, Wallet } from "lucide-react";

const HOURLY_RATE = 50;

function formatElapsed(seconds: number): string {
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${secs}`;
}

export default function SessionPage() {
  const [isStarted, setIsStarted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const seconds = elapsedSeconds;

  useEffect(() => {
    if (!isStarted) return;
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isStarted]);

  const timerText = useMemo(() => formatElapsed(seconds), [seconds]);
  const earnedMoney = useMemo(() => (seconds / 3600) * HOURLY_RATE, [seconds]);

  return (
    <main className="min-h-[100dvh] bg-[#FDFBF6] px-4 py-6" dir="rtl">
      <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
        <section className="grid grid-cols-3 gap-3">
          <button className="flex aspect-square flex-col items-center justify-center rounded-2xl bg-white p-3 text-navy-header shadow-soft">
            <Calendar className="h-6 w-6" />
            <span className="mt-2 text-sm font-semibold">יומן</span>
          </button>
          <button className="flex aspect-square flex-col items-center justify-center rounded-2xl bg-white p-3 text-navy-header shadow-soft">
            <Wallet className="h-6 w-6" />
            <span className="mt-2 text-sm font-semibold">ארנק</span>
          </button>
          <button className="flex aspect-square flex-col items-center justify-center rounded-2xl bg-white p-3 text-navy-header shadow-soft">
            <Settings className="h-6 w-6" />
            <span className="mt-2 text-sm font-semibold">הגדרות</span>
          </button>
        </section>

        <section className="rounded-3xl bg-white px-5 py-8 text-center shadow-soft">
          <p className="text-5xl font-bold tracking-wider text-navy-header">{timerText}</p>
          <p className="mt-3 text-lg font-semibold text-navy-800">סכום שנצבר: ₪{earnedMoney.toFixed(2)}</p>

          <div className="mt-8 flex items-center justify-center">
            {isStarted ? (
              <button
                className="flex h-[280px] w-[280px] items-center justify-center rounded-full bg-[#FF8A8A] text-5xl font-bold text-white shadow-soft transition hover:brightness-105 active:brightness-95"
                onClick={() => setIsStarted(false)}
              >
                סיום
              </button>
            ) : (
              <button
                className="flex h-[280px] w-[280px] flex-col items-center justify-center gap-3 rounded-full bg-[#CFE8C8] text-white shadow-soft transition hover:brightness-105 active:brightness-95"
                onClick={() => {
                  setElapsedSeconds(0);
                  setIsStarted(true);
                }}
              >
                <span className="relative h-16 w-16 overflow-hidden rounded-full border border-white/70 bg-white/70">
                  <Image src="/logo.png" alt="" fill className="object-cover object-center" />
                </span>
                <span className="text-5xl font-bold">להתחיל</span>
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
