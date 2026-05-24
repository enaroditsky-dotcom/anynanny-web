"use client";

import { DEFAULT_HOURLY_RATE, SESSIONS_TABLE } from "@/lib/billing/session-types";

export const HOURLY_RATE = DEFAULT_HOURLY_RATE;
export { SESSIONS_TABLE };

export const SESSION_STATE_KEY = "anynanny_payer_session_v1";
export const SESSION_STATUS_PENDING = "pending";
export const SESSION_STATUS_PENDING_SITTER_APPROVAL = "pending_sitter_approval";

/** Status strings that mean “waiting for sitter to confirm start”. */
export const SESSION_PENDING_START_STATUSES: readonly string[] = [
  SESSION_STATUS_PENDING,
  SESSION_STATUS_PENDING_SITTER_APPROVAL,
  "pending"
];

export type SessionProtocolState = {
  status: "idle" | "parent_initiated" | "active" | "ended";
  parentStartedAtMs?: number;
  endedAtMs?: number;
  finalElapsedSeconds?: number;
  finalAmountNis?: number;
  hourlyRate?: number;
  supabaseSessionId?: string;
  /** Parent requested end (`end_time_requested` / legacy `parent_end_requested_at`). */
  endRequested?: boolean;
  parentEndRequestedAtMs?: number;
  /** Parent confirmed end (`end_time_confirmed_by_parent`). */
  endConfirmed?: boolean;
  /** Sitter confirmed start (`start_time_confirmed_by_sitter` / legacy `start_confirmed`). */
  startConfirmed?: boolean;
};

export type SupabaseSessionRow = {
  id: string | number;
  /** Authenticated Supabase auth.users id for the parent who started the session (= sessions.parent_id). */
  parent_id?: string | null;
  /** @deprecated use parent_id — older rows may still use user_id */
  user_id?: string | null;
  sitter_id?: string | null;
  status: string;
  hourly_rate?: number | null;
  start_time_requested?: string | null;
  start_time_confirmed_by_sitter?: string | null;
  end_time_requested?: string | null;
  end_time_confirmed_by_parent?: string | null;
  total_minutes?: number | null;
  total_amount?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  final_elapsed_seconds?: number | null;
  final_amount_nis?: number | null;
  end_requested?: boolean | null;
  end_confirmed?: boolean | null;
  start_confirmed?: boolean | null;
  parent_end_requested_at?: string | null;
  /** @deprecated legacy sitter end confirm */
  sitter_end_confirmed_at?: string | null;
};

export function formatElapsed(seconds: number): string {
  const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${secs}`;
}

/**
 * Live elapsed seconds for an **active** session — identical on parent and sitter:
 * `(now or parent_end_requested_at) - start_time` from the DB.
 */
export function computeLiveElapsedSecondsActive(params: {
  startMs: number | undefined;
  parentEndRequestedAtMs: number | null | undefined;
  nowMs: number;
}): number {
  if (params.startMs == null) return 0;
  const endWallMs =
    params.parentEndRequestedAtMs != null ? params.parentEndRequestedAtMs : params.nowMs;
  return Math.max(0, Math.floor((endWallMs - params.startMs) / 1000));
}

export function readSessionState(): SessionProtocolState {
  const raw = localStorage.getItem(SESSION_STATE_KEY);
  if (!raw) return { status: "idle" };
  try {
    return JSON.parse(raw) as SessionProtocolState;
  } catch {
    return { status: "idle" };
  }
}

export function persistSessionState(next: SessionProtocolState) {
  localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(next));
}

export function mapSupabaseRowToProtocol(row: SupabaseSessionRow | null | undefined): SessionProtocolState | null {
  if (!row) return null;

  const billableStartIso =
    row.start_time_confirmed_by_sitter ?? row.start_time ?? null;
  const startedMs = billableStartIso ? new Date(billableStartIso).getTime() : undefined;

  const endConfirmedIso =
    row.end_time_confirmed_by_parent ?? row.end_time ?? row.sitter_end_confirmed_at ?? null;
  const endedMs = endConfirmedIso ? new Date(endConfirmedIso).getTime() : undefined;

  const endRequestedIso = row.end_time_requested ?? row.parent_end_requested_at ?? null;
  const parentEndReqMs = endRequestedIso ? new Date(endRequestedIso).getTime() : undefined;

  const hourlyRate = Number(row.hourly_rate);
  const finalAmount =
    row.total_amount != null
      ? Number(row.total_amount)
      : row.final_amount_nis != null
        ? Number(row.final_amount_nis)
        : undefined;

  const finalSeconds =
    row.total_minutes != null
      ? row.total_minutes * 60
      : row.final_elapsed_seconds ?? undefined;

  const mappedStatus: SessionProtocolState["status"] =
    SESSION_PENDING_START_STATUSES.includes(row.status)
      ? "parent_initiated"
      : row.status === "completed"
        ? "ended"
        : row.status === "active"
          ? "active"
          : "idle";

  return {
    status: mappedStatus,
    parentStartedAtMs: startedMs,
    endedAtMs: endedMs,
    finalElapsedSeconds: finalSeconds,
    finalAmountNis: finalAmount,
    hourlyRate: Number.isFinite(hourlyRate) && hourlyRate > 0 ? hourlyRate : HOURLY_RATE,
    supabaseSessionId: String(row.id),
    endRequested: Boolean(endRequestedIso),
    parentEndRequestedAtMs: parentEndReqMs,
    endConfirmed: Boolean(row.end_time_confirmed_by_parent) || Boolean(row.end_confirmed),
    startConfirmed:
      Boolean(row.start_time_confirmed_by_sitter) || Boolean(row.start_confirmed)
  };
}
