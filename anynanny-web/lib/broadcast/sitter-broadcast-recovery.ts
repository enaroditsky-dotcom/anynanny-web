/**
 * Sitter AnyNanny NOW recovery.
 *
 * Database `broadcast_alerts.status` is the source of truth for lifecycle.
 * Realtime is only an optimization. Catch-up recovers currently active,
 * city-eligible requests that are still relevant as an urgent NOW call.
 */

export const ACTIVE_SITTER_BROADCAST_STATUS = "active";

/** Urgent NOW calls stay recoverable for this long after `created_at`. */
export const ACTIVE_SITTER_BROADCAST_RELEVANCE_MS = 2 * 60 * 60 * 1000;

/** Tolerate small client/server clock skew when comparing `created_at`. */
const CREATED_AT_CLOCK_SKEW_MS = 2 * 60 * 1000;

export const TERMINAL_SITTER_BROADCAST_STATUSES = [
  "expired",
  "filled",
  "paused",
  "cancelled"
] as const;

export type TerminalSitterBroadcastStatus =
  (typeof TERMINAL_SITTER_BROADCAST_STATUSES)[number];

export type SitterBroadcastRow = {
  id?: string | null;
  city?: string | null;
  service_type?: string | null;
  status?: string | null;
  created_at?: string | null;
};

export type RecoverableSitterBroadcast = {
  id: string;
  city: string;
  service_type: string;
  created_at?: string;
};

export type SitterBroadcastRecoveryResult = {
  /** Non-dismissed active city-eligible row to show, if opening is allowed. */
  open: RecoverableSitterBroadcast | null;
  /** Currently displayed id is no longer an active eligible row. */
  clearCurrent: boolean;
};

export function isActiveSitterBroadcastStatus(
  status: string | null | undefined
): boolean {
  return String(status ?? "").trim().toLowerCase() === ACTIVE_SITTER_BROADCAST_STATUS;
}

export function isTerminalSitterBroadcastStatus(
  status: string | null | undefined
): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return (TERMINAL_SITTER_BROADCAST_STATUSES as readonly string[]).includes(
    normalized
  );
}

export function broadcastCityMatchesSitter(
  city: string | null | undefined,
  sitterCities: readonly string[]
): boolean {
  const needle = String(city ?? "").trim();
  if (!needle) return false;
  return sitterCities.some((candidate) => candidate.trim() === needle);
}

export function isSitterBroadcastCreatedAtRelevant(
  createdAt: string | null | undefined,
  nowMs = Date.now()
): boolean {
  const createdMs = new Date(String(createdAt ?? "")).getTime();
  if (!Number.isFinite(createdMs)) return false;
  const ageMs = nowMs - createdMs;
  if (ageMs < -CREATED_AT_CLOCK_SKEW_MS) return false;
  return ageMs <= ACTIVE_SITTER_BROADCAST_RELEVANCE_MS;
}

export function toRecoverableSitterBroadcast(
  row: SitterBroadcastRow,
  nowMs = Date.now()
): RecoverableSitterBroadcast | null {
  const id = String(row.id ?? "").trim();
  if (!id) return null;
  if (!isActiveSitterBroadcastStatus(row.status)) return null;
  if (!isSitterBroadcastCreatedAtRelevant(row.created_at, nowMs)) return null;

  return {
    id,
    city: String(row.city ?? "").trim(),
    service_type: String(row.service_type ?? ""),
    created_at: row.created_at ? String(row.created_at) : undefined
  };
}

/**
 * Decide what the sitter overlay should do after a DB catch-up poll.
 * Abandoned/stale `active` rows outside the NOW relevance window must not open.
 */
export function recoverActiveSitterBroadcast(input: {
  rows: readonly SitterBroadcastRow[];
  sitterCities: readonly string[];
  dismissedIds: ReadonlySet<string>;
  paused: boolean;
  currentId: string | null;
  nowMs?: number;
}): SitterBroadcastRecoveryResult {
  const nowMs = input.nowMs ?? Date.now();
  const eligible = input.rows
    .map((row) => toRecoverableSitterBroadcast(row, nowMs))
    .filter((row): row is RecoverableSitterBroadcast => {
      if (!row) return false;
      return broadcastCityMatchesSitter(row.city, input.sitterCities);
    });

  const currentStillActive = Boolean(
    input.currentId && eligible.some((row) => row.id === input.currentId)
  );

  const open = input.paused
    ? null
    : eligible.find((row) => !input.dismissedIds.has(row.id)) ?? null;

  return {
    open,
    clearCurrent: Boolean(input.currentId) && !currentStillActive
  };
}
