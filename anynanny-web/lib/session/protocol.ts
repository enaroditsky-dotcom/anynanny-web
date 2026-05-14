"use client";

export const HOURLY_RATE = 50;
export const SESSION_STATE_KEY = "anynanny_payer_session_v1";
export const SESSIONS_TABLE = "sessions";

/** DB session lifecycle — parent opens shift awaiting sitter confirmation. */
export const SESSION_STATUS_PENDING_SITTER_APPROVAL = "pending_sitter_approval";

/** Parent cancelled before sitter confirmed start (or withdrew a pending request). */
export const SESSION_STATUS_CANCELLED = "cancelled";

/** Status strings that mean “waiting for sitter to confirm start” (constraint removed — include legacy `pending`). */
export const SESSION_PENDING_START_STATUSES: readonly string[] = [
  SESSION_STATUS_PENDING_SITTER_APPROVAL,
  "pending",
  "pending_confirmation"
];

export type SessionProtocolState = {
  status: "idle" | "parent_initiated" | "active" | "ended";
  parentStartedAtMs?: number;
  endedAtMs?: number;
  finalElapsedSeconds?: number;
  finalAmountNis?: number;
  supabaseSessionId?: string;
  /** Parent requested end (`parent_end_requested_at` set); nanny must confirm to finalize. */
  endRequested?: boolean;
  parentEndRequestedAtMs?: number;
  /** Sitter finalized end (`sitter_end_confirmed_at` / legacy `end_confirmed`). */
  endConfirmed?: boolean;
  /** Sitter confirmed start (mirrors DB start_confirmed when active). */
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
  start_time?: string | null;
  end_time?: string | null;
  final_elapsed_seconds?: number | null;
  final_amount_nis?: number | null;
  end_requested?: boolean | null;
  end_confirmed?: boolean | null;
  start_confirmed?: boolean | null;
  parent_end_requested_at?: string | null;
  /** When sitter confirms end (new column). */
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
  const startedMs = row.start_time ? new Date(row.start_time).getTime() : undefined;
  const endedMs = row.end_time ? new Date(row.end_time).getTime() : undefined;
  const parentEndReqMs = row.parent_end_requested_at
    ? new Date(row.parent_end_requested_at).getTime()
    : undefined;
  if (row.status === SESSION_STATUS_CANCELLED) {
    return { status: "idle" };
  }

  const isPendingStart = SESSION_PENDING_START_STATUSES.includes(row.status);

  const mappedStatus: SessionProtocolState["status"] = isPendingStart
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
    finalElapsedSeconds: row.final_elapsed_seconds ?? undefined,
    finalAmountNis: row.final_amount_nis ?? undefined,
    supabaseSessionId: String(row.id),
    endRequested: Boolean(row.parent_end_requested_at),
    parentEndRequestedAtMs: parentEndReqMs,
    endConfirmed: Boolean(row.sitter_end_confirmed_at) || Boolean(row.end_confirmed),
    startConfirmed: Boolean(row.start_confirmed)
  };
}
