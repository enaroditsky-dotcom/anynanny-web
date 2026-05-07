"use client";

import { useEffect, useMemo, useState } from "react";

function formatElapsed(seconds: number): string {
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${secs}`;
}

export default function SessionPage() {
  const [isStarted, setIsStarted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isStarted) return;
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isStarted]);

  const timerText = useMemo(() => formatElapsed(elapsedSeconds), [elapsedSeconds]);

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-brand-cream px-4 text-center" dir="rtl">
      {isStarted ? <p className="mb-8 text-4xl font-bold tracking-wider text-navy-header">{timerText}</p> : null}

      {isStarted ? (
        <button
          className="flex h-[280px] w-[280px] items-center justify-center rounded-full bg-[#FF8A8A] text-5xl font-bold text-white shadow-soft transition hover:brightness-105 active:brightness-95"
          onClick={() => setIsStarted(false)}
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
    </main>
  );
}
