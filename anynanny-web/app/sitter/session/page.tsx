"use client";

import { useEffect, useState } from "react";
import type { SessionView } from "@/lib/session/types";

function fmtNis(value: number) {
  return `₪${value.toFixed(2)}`;
}

function computeLiveMinutes(session: SessionView | null, nowMs: number): number {
  if (!session?.startedAt) return 0;
  const endIso = session.endedAt ?? (session.status === "active" ? new Date(nowMs).toISOString() : session.startedAt);
  const minutes = Math.floor((new Date(endIso).getTime() - new Date(session.startedAt).getTime()) / 60000);
  return Math.max(0, minutes);
}

export default function SitterSessionPage() {
  const [sessionId, setSessionId] = useState("");
  const [session, setSession] = useState<SessionView | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [duePings, setDuePings] = useState<string[]>([]);
  const [message, setMessage] = useState("הזינו מזהה סשן כדי להתחבר למפגש.");

  const loadSession = async (id: string) => {
    if (!id) return;
    const response = await fetch(`/api/session?sessionId=${encodeURIComponent(id)}`);
    if (!response.ok) {
      setMessage("הסשן לא נמצא.");
      return;
    }
    const data = (await response.json()) as { session: SessionView; dueReassurancePings?: string[] };
    setSession(data.session);
    const due = data.dueReassurancePings ?? [];
    if (due.length) {
      setDuePings((prev) => [...prev, ...due]);
      if (typeof window !== "undefined" && data.session.reassurancePingEnabled) {
        const ctx = new window.AudioContext();
        const osc = ctx.createOscillator();
        osc.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.start();
        setTimeout(() => {
          osc.stop();
          void ctx.close();
        }, 180);
      }
    }
    setMessage("מחובר/ת לסשן פעיל.");
  };

  const confirm = async (action: "start" | "end") => {
    if (!session) return;
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.sessionId,
        bookingId: session.bookingId,
        sitterId: session.sitterId,
        parentName: session.parentName,
        hourlyRateNis: session.hourlyRateNis,
        party: "sitter",
        action
      })
    });
    if (!response.ok) return;
    const data = (await response.json()) as { session: SessionView };
    setSession(data.session);
  };

  useEffect(() => {
    if (!session?.sessionId) return;
    const timer = setInterval(() => void loadSession(session.sessionId), 10000);
    return () => clearInterval(timer);
  }, [session?.sessionId]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const liveMinutes = computeLiveMinutes(session, nowMs);
  const liveCost = session ? (session.hourlyRateNis / 60) * liveMinutes : 0;
  const waitingText =
    session?.waitingFor === "parent" ? "ממתין/ה לאישור הורה" : session?.waitingFor === "sitter" ? "ממתין/ה לאישור סיטר/ית" : "";

  return (
    <main className="mx-auto max-w-xl space-y-4 p-6" dir="rtl">
      <h1 className="text-2xl font-semibold text-navy-900">מסך סשן לסיטר/ית</h1>
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <label className="text-sm">
          מזהה סשן
          <input className="mt-1 w-full rounded-lg border p-2" value={sessionId} onChange={(e) => setSessionId(e.target.value)} />
        </label>
        <button className="mt-2 rounded-lg bg-navy-800 px-3 py-2 text-sm text-white" onClick={() => void loadSession(sessionId)}>
          התחברות לסשן
        </button>
      </div>
      {session ? (
        <div className="rounded-xl bg-white p-4 shadow-sm text-sm">
          <p>סטטוס: {session.status}</p>
          {waitingText ? <p className="text-amber-700">ממתין לצד השני: {waitingText}</p> : null}
          <p>משך מדויק: {liveMinutes} דקות</p>
          <p>עלות מצטברת: {fmtNis(liveCost)}</p>
          <div className="mt-3 flex gap-2">
            <button className="rounded-lg bg-emerald-700 px-3 py-2 text-white" onClick={() => void confirm("start")}>אישור התחלה</button>
            <button className="rounded-lg bg-rose-700 px-3 py-2 text-white" onClick={() => void confirm("end")}>אישור סיום</button>
          </div>
          {duePings.length > 0 ? <p className="mt-2 text-xs text-amber-700">פינג הרגעה הופעל בשעות: {duePings.join(", ")}</p> : null}
        </div>
      ) : (
        <p className="text-sm text-navy-700">{message}</p>
      )}
    </main>
  );
}
