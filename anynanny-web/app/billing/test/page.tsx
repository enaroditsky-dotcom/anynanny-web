"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ParentActiveSession } from "@/components/billing/ParentActiveSession";
import { SitterActiveSession } from "@/components/billing/SitterActiveSession";
import {
  BILLING_SESSION_SELECT,
  getBillingState,
  type BillingSessionRow
} from "@/lib/billing/session-billing";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";
import { SESSIONS_TABLE } from "@/lib/session/protocol";

type TestRole = "parent" | "sitter";

function BillingTestPageInner() {
  const searchParams = useSearchParams();
  const sessionIdParam = searchParams.get("sessionId") ?? "";
  const roleParam = (searchParams.get("role") ?? "parent") as TestRole;

  const [sessionId, setSessionId] = useState(sessionIdParam);
  const [role, setRole] = useState<TestRole>(roleParam === "sitter" ? "sitter" : "parent");
  const [userId, setUserId] = useState<string | null>(null);
  const [debugRow, setDebugRow] = useState<BillingSessionRow | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const auth = await resolveBrowserAuth();
      if (!auth.ok) {
        setAuthError(auth.reason === "no_client" ? "Supabase לא מוגדר." : "יש להתחבר.");
        return;
      }
      setUserId(auth.userId);
      setAuthError(null);
    })();
  }, []);

  const refreshDebug = useCallback(async () => {
    if (!sessionId.trim()) {
      setDebugRow(null);
      return;
    }
    const auth = await resolveBrowserAuth();
    if (!auth.ok) return;

    const { data } = await auth.supabase
      .from(SESSIONS_TABLE)
      .select(BILLING_SESSION_SELECT)
      .eq("id", sessionId.trim())
      .maybeSingle();

    if (data && typeof data === "object") {
      setDebugRow(data as BillingSessionRow);
    } else {
      setDebugRow(null);
    }
  }, [sessionId]);

  useEffect(() => {
    void refreshDebug();
    const interval = window.setInterval(() => void refreshDebug(), 2000);
    return () => window.clearInterval(interval);
  }, [refreshDebug]);

  const billingState = useMemo(() => getBillingState(debugRow), [debugRow]);

  const resetShakes = async () => {
    if (!sessionId.trim() || resetBusy) return;
    const auth = await resolveBrowserAuth();
    if (!auth.ok) return;

    setResetBusy(true);
    await auth.supabase
      .from(SESSIONS_TABLE)
      .update({
        sitter_start_shake: null,
        parent_start_shake: null,
        sitter_end_shake: null,
        parent_end_shake: null,
        session_status: "pending",
        total_amount_charged: null,
        final_elapsed_seconds: null,
        final_amount_nis: null,
        end_time: null
      })
      .eq("id", sessionId.trim());
    await refreshDebug();
    setResetBusy(false);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-[#FDFBF6] p-4" dir="rtl">
      <header className="space-y-2 text-right">
        <p className="text-xs font-semibold uppercase tracking-wide text-navy-800/60">Dev only</p>
        <h1 className="text-xl font-bold text-[#001F3F]">בדיקת חיוב Double-Shake</h1>
        <p className="text-sm text-navy-800/75">
          State machine מבוסס timestamps בלבד — לא תלוי ב-<code className="text-xs">sessions.status</code>.
        </p>
      </header>

      <section className="space-y-3 rounded-3xl bg-white p-4 shadow-soft">
        <label className="block text-right text-sm font-semibold text-navy-header">
          Session ID
          <input
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-navy-header/15 px-3 py-2 text-left text-sm tabular-nums"
            placeholder="uuid"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRole("parent")}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${
              role === "parent"
                ? "bg-[#001F3F] text-white"
                : "border border-navy-header/20 text-navy-header"
            }`}
          >
            הורה
          </button>
          <button
            type="button"
            onClick={() => setRole("sitter")}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${
              role === "sitter"
                ? "bg-[#001F3F] text-white"
                : "border border-navy-header/20 text-navy-header"
            }`}
          >
            בייביסיטר
          </button>
        </div>

        <button
          type="button"
          disabled={resetBusy || !sessionId.trim()}
          onClick={() => void resetShakes()}
          className="w-full rounded-xl border border-rose-300/90 bg-rose-50/50 px-4 py-2.5 text-sm font-semibold text-rose-800 disabled:opacity-50"
        >
          {resetBusy ? "מאפס…" : "איפוס כל ה-shakes (לבדיקה)"}
        </button>
      </section>

      {debugRow ? (
        <section className="rounded-2xl border border-navy-header/10 bg-white p-3 text-right text-xs tabular-nums text-navy-800 shadow-sm">
          <p className="font-bold text-[#001F3F]">מצב נוכחי: {billingState ?? "—"}</p>
          <p>sitter_start: {debugRow.sitter_start_shake ?? "NULL"}</p>
          <p>parent_start: {debugRow.parent_start_shake ?? "NULL"}</p>
          <p>sitter_end: {debugRow.sitter_end_shake ?? "NULL"}</p>
          <p>parent_end: {debugRow.parent_end_shake ?? "NULL"}</p>
        </section>
      ) : null}

      {authError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-sm font-semibold text-rose-800">
          {authError}
        </p>
      ) : null}

      {userId && sessionId.trim() ? (
        role === "parent" ? (
          <ParentActiveSession sessionId={sessionId.trim()} parentId={userId} />
        ) : (
          <SitterActiveSession sessionId={sessionId.trim()} sitterId={userId} />
        )
      ) : (
        <p className="text-center text-sm text-navy-800/70">הזינו session ID והתחברו כדי להתחיל.</p>
      )}
    </main>
  );
}

export default function BillingTestPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-md p-4 text-center text-sm text-navy-800/70">טוען…</main>
      }
    >
      <BillingTestPageInner />
    </Suspense>
  );
}
