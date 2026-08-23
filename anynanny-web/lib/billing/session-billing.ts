"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HOURLY_RATE, SESSIONS_TABLE, formatElapsed } from "@/lib/session/protocol";
import { friendlySupabaseSessionError } from "@/lib/session/supabase-errors";
import { isPostgrestMissingColumnError, isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";

export type BillingSessionRow = {
  id: string;
  parent_id: string;
  sitter_id: string | null;
  status: string;
  session_status?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  sitter_start_shake?: string | null;
  parent_start_shake?: string | null;
  sitter_end_shake?: string | null;
  parent_end_shake?: string | null;
  billing_rate_per_minute?: number | null;
  total_amount_charged?: number | null;
  stripe_payment_intent_id?: string | null;
  final_elapsed_seconds?: number | null;
  final_amount_nis?: number | null;
};

export type BillingState =
  | "WAITING_START"
  | "WAITING_PARENT_START"
  | "ACTIVE_RUNNING"
  | "WAITING_PARENT_END"
  | "COMPLETED";

export const BILLING_SESSION_SELECT =
  "id, parent_id, sitter_id, status, session_status, start_time, end_time, sitter_start_shake, parent_start_shake, sitter_end_shake, parent_end_shake, billing_rate_per_minute, total_amount_charged, stripe_payment_intent_id, final_elapsed_seconds, final_amount_nis";

/**
 * Columns guaranteed to exist on every deployed schema (pre-billing-migration safe).
 * Used as a fallback when the full billing/shake columns are missing in production.
 */
export const BILLING_SESSION_SELECT_VERIFIED =
  "id, parent_id, sitter_id, status, start_time, end_time, final_elapsed_seconds, final_amount_nis";

const BILLING_SELECT_FALLBACK_CHAIN = [
  BILLING_SESSION_SELECT,
  BILLING_SESSION_SELECT_VERIFIED
] as const;

const SHAKE_TIMESTAMP_KEYS = [
  "sitter_start_shake",
  "parent_start_shake",
  "sitter_end_shake",
  "parent_end_shake"
] as const;

function hasTimestamp(value: string | null | undefined): boolean {
  return value != null && String(value).trim() !== "";
}

function parseTimestampMs(value: string | null | undefined): number | null {
  if (!hasTimestamp(value)) return null;
  const ms = new Date(value!).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** True once sitter_end_shake exists — live clock must never run again. */
export function isBillingTimerFrozen(row: BillingSessionRow | null | undefined): boolean {
  return hasTimestamp(row?.sitter_end_shake);
}

/**
 * Authoritative frozen duration (seconds): sitter_end_shake − parent_start_shake.
 * Identical on every client when both timestamps are present in the DB row.
 */
export function computeFrozenElapsedSeconds(row: BillingSessionRow | null | undefined): number | null {
  if (!row) return null;
  const startMs = parseTimestampMs(row.parent_start_shake);
  const endMs = parseTimestampMs(row.sitter_end_shake);
  if (startMs == null || endMs == null) return null;
  return Math.max(0, Math.floor((endMs - startMs) / 1000));
}

/** Merge Realtime payloads — never drop shake timestamps from partial updates. */
export function mergeBillingSessionRow(
  prev: BillingSessionRow | null,
  raw: Record<string, unknown> | null | undefined
): BillingSessionRow | null {
  if (!raw || typeof raw !== "object") return prev;
  if (!prev) return parseBillingSessionRow(raw);

  const merged: BillingSessionRow = { ...prev };

  for (const key of SHAKE_TIMESTAMP_KEYS) {
    if (!(key in raw)) continue;
    const value = raw[key];
    merged[key] = value != null && String(value).trim() !== "" ? String(value) : null;
  }

  for (const [key, value] of Object.entries(raw)) {
    if (SHAKE_TIMESTAMP_KEYS.includes(key as (typeof SHAKE_TIMESTAMP_KEYS)[number])) continue;
    if (value === undefined) continue;
    (merged as Record<string, unknown>)[key] = value;
  }

  return parseBillingSessionRow(merged as unknown as Record<string, unknown>);
}

export function parseBillingSessionRow(raw: Record<string, unknown> | null | undefined): BillingSessionRow | null {
  if (!raw || typeof raw !== "object" || raw.id == null) return null;
  return {
    id: String(raw.id),
    parent_id: String(raw.parent_id ?? ""),
    sitter_id: raw.sitter_id != null ? String(raw.sitter_id) : null,
    status: String(raw.status ?? ""),
    session_status: raw.session_status != null ? String(raw.session_status) : null,
    start_time: raw.start_time != null ? String(raw.start_time) : null,
    end_time: raw.end_time != null ? String(raw.end_time) : null,
    sitter_start_shake: raw.sitter_start_shake != null ? String(raw.sitter_start_shake) : null,
    parent_start_shake: raw.parent_start_shake != null ? String(raw.parent_start_shake) : null,
    sitter_end_shake: raw.sitter_end_shake != null ? String(raw.sitter_end_shake) : null,
    parent_end_shake: raw.parent_end_shake != null ? String(raw.parent_end_shake) : null,
    billing_rate_per_minute:
      raw.billing_rate_per_minute != null ? Number(raw.billing_rate_per_minute) : null,
    total_amount_charged: raw.total_amount_charged != null ? Number(raw.total_amount_charged) : null,
    stripe_payment_intent_id:
      raw.stripe_payment_intent_id != null ? String(raw.stripe_payment_intent_id) : null,
    final_elapsed_seconds:
      raw.final_elapsed_seconds != null ? Number(raw.final_elapsed_seconds) : null,
    final_amount_nis: raw.final_amount_nis != null ? Number(raw.final_amount_nis) : null
  };
}

export function getBillingState(session: BillingSessionRow | null | undefined): BillingState | null {
  if (!session) return null;

  const sitterStart = hasTimestamp(session.sitter_start_shake);
  const parentStart = hasTimestamp(session.parent_start_shake);
  const sitterEnd = hasTimestamp(session.sitter_end_shake);
  const parentEnd = hasTimestamp(session.parent_end_shake);

  if (sitterStart && parentStart && sitterEnd && parentEnd) return "COMPLETED";
  if (sitterStart && parentStart && sitterEnd && !parentEnd) return "WAITING_PARENT_END";
  if (sitterStart && parentStart && !sitterEnd) return "ACTIVE_RUNNING";
  if (sitterStart && !parentStart) return "WAITING_PARENT_START";
  return "WAITING_START";
}

/** @deprecated Use getBillingState */
export function resolveBillingSessionState(session: BillingSessionRow | null | undefined): BillingState | null {
  return getBillingState(session);
}

export function billingRatePerMinute(row: BillingSessionRow | null | undefined): number {
  const rate = Number(row?.billing_rate_per_minute);
  if (Number.isFinite(rate) && rate > 0) return rate;
  return HOURLY_RATE / 60;
}

export function billingStartMs(row: BillingSessionRow | null | undefined): number | null {
  return parseTimestampMs(row?.parent_start_shake ?? null);
}

/**
 * Synced billing elapsed seconds — DB timestamps only once sitter_end_shake exists.
 * Live phase uses UTC whole-second math from parent_start_shake (never local uptime).
 */
export function computeBillingElapsedSeconds(
  row: BillingSessionRow | null | undefined,
  utcTickSecond: number | null
): number {
  if (!row) return 0;

  const frozen = computeFrozenElapsedSeconds(row);
  if (frozen != null) return frozen;

  const startMs = billingStartMs(row);
  if (startMs == null || utcTickSecond == null) return 0;

  const startSecond = Math.floor(startMs / 1000);
  return Math.max(0, utcTickSecond - startSecond);
}

/** @deprecated Use computeBillingElapsedSeconds */
export function computeLiveElapsedSeconds(
  _state: BillingState | null,
  row: BillingSessionRow | null | undefined,
  nowMs: number
): number {
  return computeBillingElapsedSeconds(row, Math.floor(nowMs / 1000));
}

export function computeAccruedNis(row: BillingSessionRow | null | undefined, elapsedSeconds: number): number {
  const rate = billingRatePerMinute(row);
  return Math.round(((elapsedSeconds / 60) * rate) * 100) / 100;
}

export function formatNis(amount: number): string {
  return amount.toFixed(2);
}

export function computeFinalTotals(row: BillingSessionRow) {
  const elapsedSeconds = computeFrozenElapsedSeconds(row) ?? 0;
  const amount = computeAccruedNis(row, elapsedSeconds);
  return { elapsedSeconds, amountNis: amount };
}

export function computeCompletedSummary(row: BillingSessionRow): { elapsedSeconds: number; amountNis: number } {
  const frozen = computeFrozenElapsedSeconds(row);
  if (frozen != null) {
    const amountNis =
      row.total_amount_charged != null && Number.isFinite(Number(row.total_amount_charged))
        ? Number(row.total_amount_charged)
        : computeAccruedNis(row, frozen);
    return { elapsedSeconds: frozen, amountNis };
  }

  if (
    row.final_elapsed_seconds != null &&
    Number.isFinite(Number(row.final_elapsed_seconds)) &&
    row.total_amount_charged != null &&
    Number.isFinite(Number(row.total_amount_charged))
  ) {
    return {
      elapsedSeconds: Math.max(0, Math.floor(Number(row.final_elapsed_seconds))),
      amountNis: Number(row.total_amount_charged)
    };
  }

  return { elapsedSeconds: 0, amountNis: 0 };
}

async function updateSessionWithFallbacks(
  supabase: SupabaseClient,
  sessionId: string,
  roleFilter: { column: "sitter_id" | "parent_id"; value: string },
  payloads: Record<string, unknown>[]
): Promise<{ error: string | null; row: BillingSessionRow | null }> {
  let lastError: string | null = null;

  for (const payload of payloads) {
    const { data, error } = await supabase
      .from(SESSIONS_TABLE)
      .update(payload)
      .eq("id", sessionId)
      .eq(roleFilter.column, roleFilter.value)
      .select(BILLING_SESSION_SELECT)
      .maybeSingle();

    if (!error && data) {
      return { error: null, row: parseBillingSessionRow(data as Record<string, unknown>) };
    }

    if (error) {
      lastError = error.message;
      const optionalMissing = Object.keys(payload).some((key) =>
        isPostgrestMissingColumnError(error.message, key)
      );
      if (!optionalMissing) {
        return { error: friendlySupabaseSessionError(error), row: null };
      }
    }
  }

  return {
    error: lastError ? friendlySupabaseSessionError(lastError) : "לא ניתן לעדכן את המשמרת.",
    row: null
  };
}

export async function recordSitterStartShake(
  supabase: SupabaseClient,
  sessionId: string,
  sitterId: string
): Promise<{ error: string | null; row: BillingSessionRow | null }> {
  const startIso = new Date().toISOString();
  return updateSessionWithFallbacks(
    supabase,
    sessionId,
    { column: "sitter_id", value: sitterId },
    [
      { sitter_start_shake: startIso, session_status: "sitter_started" },
      { sitter_start_shake: startIso, session_status: "pending" },
      { sitter_start_shake: startIso }
    ]
  );
}

export async function recordParentStartShake(
  supabase: SupabaseClient,
  sessionId: string,
  parentId: string
): Promise<{ error: string | null; row: BillingSessionRow | null }> {
  const startIso = new Date().toISOString();
  return updateSessionWithFallbacks(
    supabase,
    sessionId,
    { column: "parent_id", value: parentId },
    [
      {
        parent_start_shake: startIso,
        session_status: "in_progress",
        status: "active",
        start_time: startIso
      },
      { parent_start_shake: startIso, session_status: "active", status: "active", start_time: startIso },
      { parent_start_shake: startIso, status: "active", start_time: startIso },
      { parent_start_shake: startIso }
    ]
  );
}

export async function recordSitterEndShake(
  supabase: SupabaseClient,
  sessionId: string,
  sitterId: string
): Promise<{ error: string | null; row: BillingSessionRow | null }> {
  const endIso = new Date().toISOString();
  return updateSessionWithFallbacks(
    supabase,
    sessionId,
    { column: "sitter_id", value: sitterId },
    [
      { session_status: "sitter_ended", sitter_end_shake: endIso },
      { session_status: "sitter_ended" }
    ]
  );
}

export async function recordParentConfirmEnd(
  supabase: SupabaseClient,
  sessionId: string,
  _parentId?: string,
  _row?: BillingSessionRow
): Promise<{ error: string | null; row: BillingSessionRow | null }> {
  // Duration, amount, and end time are derived inside end_shift_atomic.
  const { data, error } = await supabase.rpc("end_shift_atomic", {
    p_session_id: sessionId
  });

  if (error) {
    console.error("[Billing] Atomic shift end failed:", error);
    return { error: error.message, row: null };
  }

  return { error: null, row: (data as BillingSessionRow | null) ?? null };
}

/** @deprecated Use recordParentConfirmEnd */
export async function recordParentEndShake(
  supabase: SupabaseClient,
  sessionId: string,
  parentId: string,
  row: BillingSessionRow
): Promise<{ error: string | null; row: BillingSessionRow | null }> {
  return recordParentConfirmEnd(supabase, sessionId, parentId, row);
}

type UseBillingSessionOptions = {
  sessionId: string;
  participantColumn: "sitter_id" | "parent_id";
  participantId: string;
};

export function useBillingSession({ sessionId, participantColumn, participantId }: UseBillingSessionOptions) {
  const [row, setRow] = useState<BillingSessionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [utcTickSecond, setUtcTickSecond] = useState<number | null>(() => Math.floor(Date.now() / 1000));

  const replaceSessionRow = useCallback((raw: Record<string, unknown> | null | undefined) => {
    const parsed = parseBillingSessionRow(raw);
    if (parsed) setRow(parsed);
  }, []);

  const fetchSession = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !sessionId || !participantId) {
      setLoading(false);
      setError("Supabase לא מוגדר.");
      return null;
    }

    try {
      let lastError: { message: string } | null = null;

      for (const select of BILLING_SELECT_FALLBACK_CHAIN) {
        const { data, error: fetchError } = await supabase
          .from(SESSIONS_TABLE)
          .select(select)
          .eq("id", sessionId)
          .eq(participantColumn, participantId)
          .maybeSingle();

        if (!fetchError) {
          replaceSessionRow(data as Record<string, unknown> | null);
          setError(null);
          setLoading(false);
          return parseBillingSessionRow(data as Record<string, unknown> | null);
        }

        lastError = fetchError;
        // Drift: missing billing/shake columns → retry with verified columns only.
        if (isPostgrestSchemaDriftError(fetchError.message)) continue;
        break;
      }

      // Schema drift on every attempt → degrade to a clean state, never tear down the tree.
      if (lastError && isPostgrestSchemaDriftError(lastError.message)) {
        console.warn("[billing] session columns unavailable, returning clean state:", lastError.message);
        setError(null);
        setLoading(false);
        return null;
      }

      setError(lastError ? friendlySupabaseSessionError(lastError) : null);
      setLoading(false);
      return null;
    } catch (err) {
      // Network/unexpected failure → clean state, no unhandled exception.
      console.warn("[billing] session fetch threw, returning clean state:", err);
      setError(null);
      setLoading(false);
      return null;
    }
  }, [participantColumn, participantId, replaceSessionRow, sessionId]);

  useEffect(() => {
    void fetchSession();
  }, [fetchSession]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !sessionId) return;

    const onRowChange = (payload: { eventType: string; new: unknown; old: unknown }) => {
      if (payload.eventType === "DELETE") {
        void fetchSession();
        return;
      }

      if (!payload.new || typeof payload.new !== "object") {
        void fetchSession();
        return;
      }

      const incoming = payload.new as Record<string, unknown>;
      const parsed = parseBillingSessionRow(incoming);
      if (parsed) {
        replaceSessionRow(incoming);
      }

      void fetchSession();
    };

    const channel = subscribePostgresChanges(
      supabase,
      `billing-session-sync-${sessionId}`,
      (["INSERT", "UPDATE", "DELETE"] as const).map((event) => ({
        event,
        table: SESSIONS_TABLE,
        filter: `id=eq.${sessionId}`,
        handler: onRowChange
      })),
      (status) => {
        if (status === "SUBSCRIBED") void fetchSession();
      }
    );

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [fetchSession, replaceSessionRow, sessionId]);

  const billingState = useMemo(() => getBillingState(row), [row]);
  const sessionStatus = row?.session_status?.trim().toLowerCase() ?? "";
  const isLive = sessionStatus === "in_progress";
  const timerFrozen =
    sessionStatus === "sitter_ended" ||
    sessionStatus === "completed" ||
    isBillingTimerFrozen(row);

  useEffect(() => {
    if (timerFrozen || !isLive) {
      setUtcTickSecond(null);
      return;
    }

    const syncSecond = () => setUtcTickSecond(Math.floor(Date.now() / 1000));
    syncSecond();
    const ticker = window.setInterval(syncSecond, 1000);
    return () => window.clearInterval(ticker);
  }, [isLive, timerFrozen]);

  const elapsedSeconds = useMemo(
    () => computeBillingElapsedSeconds(row, timerFrozen ? null : utcTickSecond),
    [row, timerFrozen, utcTickSecond]
  );
  const accruedNis = useMemo(() => computeAccruedNis(row, elapsedSeconds), [row, elapsedSeconds]);
  const timerText = formatElapsed(elapsedSeconds);
  const ratePerMinute = billingRatePerMinute(row);
  const completedSummary = useMemo(
    () =>
      billingState === "WAITING_PARENT_END" || billingState === "COMPLETED"
        ? row
          ? computeCompletedSummary(row)
          : null
        : null,
    [billingState, row]
  );

  const commitSessionRow = useCallback(
    (nextRow: BillingSessionRow | null) => {
      if (nextRow) replaceSessionRow(nextRow as unknown as Record<string, unknown>);
    },
    [replaceSessionRow]
  );

  return {
    row,
    billingState,
    loading,
    error,
    refresh: fetchSession,
    commitSessionRow,
    elapsedSeconds,
    accruedNis,
    timerText,
    ratePerMinute,
    isLive,
    timerFrozen,
    completedSummary,
    formatNis
  };
}

const TRACKED_BILLING_SESSION_STATUSES = [
  "confirmed",
  "sitter_started",
  "in_progress",
  "sitter_ended",
  "completed"
] as const;

const LEGACY_IN_FLIGHT_SESSION_STATUSES = [
  "pending_sitter_approval",
  "pending",
  "pending_confirmation",
  "active"
] as const;

let sessionStatusColumnAvailable: boolean | null = null;

async function queryLinkedBillingSessionId(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  participantColumn: "sitter_id" | "parent_id",
  userId: string
): Promise<{ id: string | null; error: string | null; blocked: boolean }> {
  if (sessionStatusColumnAvailable !== false) {
    const { data, error } = await supabase
      .from(SESSIONS_TABLE)
      .select("id")
      .eq(participantColumn, userId)
      .in("session_status", [...TRACKED_BILLING_SESSION_STATUSES])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error) {
      sessionStatusColumnAvailable = true;
      return { id: data?.id != null ? String(data.id) : null, error: null, blocked: false };
    }

    if (isPostgrestMissingColumnError(error.message, "session_status")) {
      sessionStatusColumnAvailable = false;
    } else {
      return { id: null, error: error.message, blocked: true };
    }
  }

  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .select("id")
    .eq(participantColumn, userId)
    .in("status", [...LEGACY_IN_FLIGHT_SESSION_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { id: null, error: error.message, blocked: true };
  }

  return { id: data?.id != null ? String(data.id) : null, error: null, blocked: false };
}

/** Resolve the latest billing session row id for the signed-in parent or sitter. */
export function useLinkedBillingSessionId(
  role: "parent" | "sitter",
  userId: string | null
): { sessionId: string | null; loading: boolean } {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const participantColumn = role === "parent" ? "parent_id" : "sitter_id";
  const fetchBlockedRef = useRef(false);

  const fetchSessionId = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId) {
      setSessionId(null);
      setLoading(false);
      return;
    }

    if (fetchBlockedRef.current) {
      setLoading(false);
      return;
    }

    try {
      const result = await queryLinkedBillingSessionId(supabase, participantColumn, userId);
      if (result.blocked) {
        fetchBlockedRef.current = true;
        console.warn("[billing] linked session id query blocked:", result.error);
      }
      setSessionId(result.id);
      setLoading(false);
    } catch {
      setSessionId(null);
      setLoading(false);
    }
  }, [participantColumn, userId]);

  useEffect(() => {
    void fetchSessionId();
  }, [fetchSessionId]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !userId) return;

    const onChange = () => {
      if (fetchBlockedRef.current) return;
      void fetchSessionId();
    };

    const channel = subscribePostgresChanges(
      supabase,
      `linked-billing-session-id-${role}-${userId}`,
      (["INSERT", "UPDATE", "DELETE"] as const).map((event) => ({
        event,
        table: SESSIONS_TABLE,
        filter: `${participantColumn}=eq.${userId}`,
        handler: onChange
      })),
      (status) => {
        if (status === "SUBSCRIBED") void fetchSessionId();
      }
    );

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [fetchSessionId, participantColumn, role, userId]);

  return { sessionId, loading };
}
