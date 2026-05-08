"use client";

import Link from "next/link";
import { Clock3, Search, Settings, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const ACTIVE_SESSION_START_KEY = "active_session_start_time";
const HOURLY_RATE = 50;

function formatElapsed(seconds: number): string {
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${secs}`;
}

export default function ParentDashboardPage() {
  const [startTimeMs, setStartTimeMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const readStart = () => {
      const raw = localStorage.getItem(ACTIVE_SESSION_START_KEY);
      if (!raw) {
        setStartTimeMs(null);
        return;
      }
      const parsed = Number(raw);
      setStartTimeMs(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
    };
    readStart();
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    const onStorage = (event: StorageEvent) => {
      if (event.key === ACTIVE_SESSION_START_KEY) readStart();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const elapsedSeconds = useMemo(() => {
    if (!startTimeMs) return 0;
    return Math.max(0, Math.floor((nowMs - startTimeMs) / 1000));
  }, [nowMs, startTimeMs]);
  const timerText = useMemo(() => formatElapsed(elapsedSeconds), [elapsedSeconds]);
  const earnedNis = useMemo(() => ((elapsedSeconds / 3600) * HOURLY_RATE).toFixed(2), [elapsedSeconds]);

  return (
    <main className="mx-auto w-full max-w-md space-y-5 bg-[#FDFBF6] py-2" dir="rtl">
      <section className="rounded-3xl bg-white p-5 shadow-soft">
        <h1 className="text-lg font-bold text-navy-header">סטטוס בייביסיטר</h1>
        {startTimeMs ? (
          <div className="mt-3 space-y-1">
            <p className="text-3xl font-bold tracking-wider text-navy-header">{timerText}</p>
            <p className="text-base font-semibold text-navy-800">סכום שנצבר: ₪{earnedNis}</p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-navy-700">אין משמרת פעילה כרגע</p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Link
          href="/parent/search"
          className="flex min-h-28 flex-col items-center justify-center rounded-2xl bg-white p-4 text-navy-header shadow-soft transition hover:bg-brand-cream/50"
        >
          <Search className="h-7 w-7" />
          <span className="mt-2 text-sm font-semibold">חיפוש נני</span>
        </Link>
        <Link
          href="/parent/wallet"
          className="flex min-h-28 flex-col items-center justify-center rounded-2xl bg-white p-4 text-navy-header shadow-soft transition hover:bg-brand-cream/50"
        >
          <Wallet className="h-7 w-7" />
          <span className="mt-2 text-sm font-semibold">ארנק דיגיטלי</span>
        </Link>
        <button
          type="button"
          className="flex min-h-28 flex-col items-center justify-center rounded-2xl bg-white p-4 text-navy-header shadow-soft transition hover:bg-brand-cream/50"
        >
          <Clock3 className="h-7 w-7" />
          <span className="mt-2 text-sm font-semibold">היסטוריה</span>
        </button>
        <button
          type="button"
          className="flex min-h-28 flex-col items-center justify-center rounded-2xl bg-white p-4 text-navy-header shadow-soft transition hover:bg-brand-cream/50"
        >
          <Settings className="h-7 w-7" />
          <span className="mt-2 text-sm font-semibold">הגדרות</span>
        </button>
      </section>
    </main>
  );
}
