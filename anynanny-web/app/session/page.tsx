"use client";

import { useEffect, useMemo, useState } from "react";

function formatElapsed(seconds: number): string {
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${secs}`;
}

export default function SessionPage() {
  const [isWorking, setIsWorking] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isWorking) return;
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isWorking]);

  const timerText = useMemo(() => formatElapsed(elapsedSeconds), [elapsedSeconds]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-brand-cream px-4" dir="rtl">
      <section className="flex w-full max-w-md flex-col items-center rounded-[2rem] bg-white/80 p-10 text-center shadow-soft backdrop-blur-md">
        {isWorking ? <p className="mb-7 text-4xl font-bold tracking-wider text-navy-header">{timerText}</p> : null}

        {isWorking ? (
          <button
            className="flex h-44 w-44 items-center justify-center rounded-full bg-brand-salmon text-4xl font-bold text-white shadow-soft transition hover:brightness-105 active:brightness-95"
            onClick={() => setIsWorking(false)}
          >
            סיום
          </button>
        ) : (
          <button
            className="flex h-44 w-44 items-center justify-center rounded-full bg-brand-mint text-4xl font-bold text-navy-header shadow-soft transition hover:brightness-105 active:brightness-95"
            onClick={() => {
              setElapsedSeconds(0);
              setIsWorking(true);
            }}
          >
            להתחיל
          </button>
        )}
      </section>
    </main>
  );
}
