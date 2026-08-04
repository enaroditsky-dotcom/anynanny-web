"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { confirmSessionStartBySitter } from "@/lib/billing/session-actions";
import { calculateLiveAmount, calculateLiveMinutes } from "@/lib/billing/session-calculator";
import {
  BILLING_PENDING_STATUSES,
  SESSIONS_TABLE,
  type BillingSessionRow
} from "@/lib/billing/session-types";
import { computeLiveElapsedSecondsActive, formatElapsed } from "@/lib/session/protocol";
import { friendlySupabaseSessionError } from "@/lib/session/supabase-errors";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";

function billableStartMs(row: BillingSessionRow): number | null {
  const iso = row.start_time_confirmed_by_sitter;
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function endRequestedMs(row: BillingSessionRow): number | null {
  const iso = row.end_time_requested;
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function hourlyRateFromRow(row: BillingSessionRow): number {
  const rate = Number(row.hourly_rate);
  return Number.isFinite(rate) && rate > 0 ? rate : 50;
}

export function useSitterBillingSession() {
  const [sitterId, setSitterId] = useState<string | null>(null);
  const [pendingRow, setPendingRow] = useState<BillingSessionRow | null>(null);
  const [activeShiftRow, setActiveShiftRow] = useState<BillingSessionRow | null>(null);
  const [endPendingRow, setEndPendingRow] = useState<BillingSessionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [confirmingStart, setConfirmingStart] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  const trackedSessionId = useMemo(() => {
    const raw = endPendingRow?.id ?? activeShiftRow?.id ?? pendingRow?.id ?? null;
    return raw != null ? String(raw) : null;
  }, [endPendingRow?.id, activeShiftRow?.id, pendingRow?.id]);

  const applyRows = useCallback((pendList: BillingSessionRow[], actList: BillingSessionRow[], uid: string) => {
    const pending = pendList.find((row) => BILLING_PENDING_STATUSES.includes(row.status)) ?? null;

    let endPending: BillingSessionRow | null = null;
    let activeOnly: BillingSessionRow | null = null;

    for (const row of actList) {
      if (row.status === "active" && row.sitter_id === uid && endRequestedMs(row) != null) {
        endPending = row;
        break;
      }
    }
    for (const row of actList) {
      if (row.status === "active" && row.sitter_id === uid && endRequestedMs(row) == null) {
        activeOnly = row;
        break;
      }
    }

    setPendingRow(pending);
    setEndPendingRow(endPending);
    setActiveShiftRow(activeOnly);
  }, []);

  const refreshForUser = useCallback(
    async (supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>, uid: string) => {
      const [pendRes, actRes] = await Promise.all([
        supabase
          .from(SESSIONS_TABLE)
          .select("*")
          .in("status", [...BILLING_PENDING_STATUSES])
          .eq("sitter_id", uid)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from(SESSIONS_TABLE)
          .select("*")
          .eq("status", "active")
          .eq("sitter_id", uid)
          .order("created_at", { ascending: false })
          .limit(10)
      ]);

      if (pendRes.error) console.warn("[sitter billing] pending fetch:", pendRes.error.message);
      if (actRes.error) console.warn("[sitter billing] active fetch:", actRes.error.message);

      applyRows(
        (pendRes.data ?? []) as BillingSessionRow[],
        (actRes.data ?? []) as BillingSessionRow[],
        uid
      );
    },
    [applyRows]
  );

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      setBanner("Supabase לא מוגדר.");
      return;
    }

    let cancelled = false;
    void (async () => {
      const auth = await resolveBrowserAuth();
      if (!auth.ok) {
        if (!cancelled) {
          setLoading(false);
          setBanner(
            auth.reason === "no_client" ? "Supabase לא מוגדר." : "יש להתחבר כדי לראות משמרות."
          );
        }
        return;
      }
      if (cancelled) return;
      setSitterId(auth.userId);
      await refreshForUser(auth.supabase, auth.userId);
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshForUser]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !sitterId || loading) return;

    const onSessionsChange = (payload: { new?: Record<string, unknown> }) => {
      const row = payload.new as BillingSessionRow | undefined;
      if (!row || typeof row !== "object") {
        void refreshForUser(supabase, sitterId);
        return;
      }

      if (BILLING_PENDING_STATUSES.includes(row.status)) {
        setPendingRow(row);
        setActiveShiftRow(null);
        setEndPendingRow(null);
        return;
      }

      if (row.status === "active" && row.sitter_id === sitterId) {
        setPendingRow(null);
        if (endRequestedMs(row) != null) {
          setEndPendingRow(row);
          setActiveShiftRow(null);
        } else {
          setActiveShiftRow(row);
          setEndPendingRow(null);
        }
        return;
      }

      if (row.status === "completed") {
        setPendingRow(null);
        setActiveShiftRow(null);
        setEndPendingRow(null);
      }
    };

    const channelName = trackedSessionId
      ? `sitter-billing-${sitterId}-${trackedSessionId}`
      : `sitter-billing-wide-${sitterId}`;

    const channel = subscribePostgresChanges(
      supabase,
      channelName,
      (["INSERT", "UPDATE", "DELETE"] as const).map((ev) => ({
        event: ev,
        table: SESSIONS_TABLE,
        ...(trackedSessionId ? { filter: `id=eq.${trackedSessionId}` } : {}),
        handler: onSessionsChange
      })),
      (status) => {
        if (status === "SUBSCRIBED") void refreshForUser(supabase, sitterId);
      }
    );

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [sitterId, trackedSessionId, loading, refreshForUser]);

  const displayRow = endPendingRow ?? activeShiftRow;

  const liveElapsed = useMemo(() => {
    if (!displayRow || displayRow.status !== "active") return 0;
    const startMs = billableStartMs(displayRow);
    if (startMs == null) return 0;
    return computeLiveElapsedSecondsActive({
      startMs,
      parentEndRequestedAtMs: endRequestedMs(displayRow),
      nowMs
    });
  }, [displayRow, nowMs]);

  const liveTimerText = useMemo(() => formatElapsed(liveElapsed), [liveElapsed]);

  const liveEarned = useMemo(() => {
    if (!displayRow || displayRow.status !== "active") return "0.00";
    const startMs = billableStartMs(displayRow);
    if (startMs == null) return "0.00";
    const rate = hourlyRateFromRow(displayRow);
    const minutes = calculateLiveMinutes({
      startTimeConfirmedBySitter: new Date(startMs),
      endTimeRequested: endRequestedMs(displayRow) ? new Date(endRequestedMs(displayRow)!) : null,
      now: new Date(nowMs)
    });
    return calculateLiveAmount(minutes, rate).toFixed(2);
  }, [displayRow, nowMs]);

  const confirmStartShift = useCallback(async () => {
    if (!pendingRow || !sitterId || confirmingStart) return;

    const auth = await resolveBrowserAuth();
    if (!auth.ok) {
      setBanner(auth.reason === "no_client" ? "Supabase לא מוגדר." : "יש להתחבר לפני אישור משמרת.");
      return;
    }
    if (auth.userId !== sitterId) {
      setBanner("פג תוקף ההזדהות — רעננו את הדף והתחברו מחדש.");
      return;
    }

    const confirmedAt = new Date().toISOString();
    const optimisticActive: BillingSessionRow = {
      ...pendingRow,
      status: "active",
      sitter_id: sitterId,
      start_time_confirmed_by_sitter: confirmedAt
    };

    setConfirmingStart(true);
    setPendingRow(null);
    setActiveShiftRow(optimisticActive);
    setBanner(null);

    try {
      const result = await confirmSessionStartBySitter(auth.supabase, {
        sessionId: String(pendingRow.id),
        sitterId
      });

      if (!result.ok) {
        setPendingRow(pendingRow);
        setActiveShiftRow(null);
        setBanner(friendlySupabaseSessionError(result.error));
        return;
      }

      const confirmedRow = result.row as BillingSessionRow;
      const rate = hourlyRateFromRow(confirmedRow);
      const loggedStartAt = confirmedRow.start_time_confirmed_by_sitter ?? confirmedAt;
      console.info("[billing] start_time_confirmed_by_sitter:", loggedStartAt, {
        sessionId: confirmedRow.id,
        hourlyRate: rate,
        liveMinutes: calculateLiveMinutes({
          startTimeConfirmedBySitter: loggedStartAt,
          now: new Date(loggedStartAt)
        }),
        liveAmount: calculateLiveAmount(
          calculateLiveMinutes({
            startTimeConfirmedBySitter: loggedStartAt,
            now: new Date(loggedStartAt)
          }),
          rate
        )
      });

      setActiveShiftRow(confirmedRow);
    } catch (e) {
      setPendingRow(pendingRow);
      setActiveShiftRow(null);
      setBanner(friendlySupabaseSessionError(e));
    } finally {
      setConfirmingStart(false);
    }
  }, [confirmingStart, pendingRow, sitterId]);

  return {
    loading,
    sitterId,
    pendingRow,
    activeShiftRow,
    endPendingRow,
    liveTimerText,
    liveEarned,
    banner,
    setBanner,
    confirmingStart,
    confirmStartShift
  };
}
