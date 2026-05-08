"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const HOURLY_RATE = 50;
const SESSION_SUMMARY_KEY = "latest_session_summary";

function formatElapsed(seconds: number): string {
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${secs}`;
}

export default function SessionPage() {
  const [isStarted, setIsStarted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [summarySeconds, setSummarySeconds] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
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
  const summaryDuration = useMemo(() => formatElapsed(summarySeconds), [summarySeconds]);
  const summaryEarnings = useMemo(() => ((summarySeconds / 3600) * HOURLY_RATE).toFixed(2), [summarySeconds]);

  const handleFinish = () => {
    setIsStarted(false);
    setSummarySeconds(seconds);
    setShowSummary(true);
  };

  const handleSendToParent = () => {
    const payload = {
      endedAt: new Date().toISOString(),
      durationText: summaryDuration,
      amountNis: Number(summaryEarnings)
    };
    localStorage.setItem(SESSION_SUMMARY_KEY, JSON.stringify(payload));
    setShowSummary(false);
  };

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-brand-cream px-4 text-center" dir="rtl">
      <Link
        href="/"
        className="absolute right-4 top-4 rounded-full border border-navy-header/25 bg-white/80 px-3 py-1.5 text-xs font-semibold text-navy-header shadow-sm backdrop-blur"
      >
        Home
      </Link>

      {isStarted ? (
        <>
          <p className="mb-3 text-4xl font-bold tracking-wider text-navy-header">{timerText}</p>
          <p className="mb-8 text-xl font-semibold text-navy-800">סכום שנצבר: ₪{earnedMoney.toFixed(2)}</p>
        </>
      ) : null}

      {isStarted ? (
        <button
          className="flex h-[280px] w-[280px] items-center justify-center rounded-full bg-[#FF8A8A] text-5xl font-bold text-white shadow-soft transition hover:brightness-105 active:brightness-95"
          onClick={handleFinish}
        >
          סיום
        </button>
      ) : (
        <button
          className="flex h-[280px] w-[280px] items-center justify-center rounded-full bg-[#CFE8C8] text-5xl font-bold text-white shadow-soft transition hover:brightness-105 active:brightness-95"
          onClick={() => {
            setElapsedSeconds(0);
            setIsStarted(true);
          }}
        >
          להתחיל
        </button>
      )}

      {showSummary ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <section className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-soft" dir="rtl">
            <p className="mb-2 text-3xl">🎉</p>
            <h2 className="text-2xl font-bold text-navy-header">סיכום משמרת</h2>
            <p className="mt-3 text-lg font-semibold text-navy-900">זמן עבודה כולל: {summaryDuration}</p>
            <p className="mt-1 text-xl font-bold text-emerald-700">הרווחת: ₪{summaryEarnings}</p>
            <button
              className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-[#001F3F] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 active:brightness-95"
              onClick={handleSendToParent}
            >
              אישור ושליחה להורה
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
