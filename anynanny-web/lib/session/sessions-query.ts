import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { SESSIONS_TABLE, SESSION_PENDING_START_STATUSES, type SupabaseSessionRow } from "@/lib/session/protocol";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
import { safeSupabaseRead } from "@/lib/supabase/safe-supabase-read";

/** Overlap probe — billing schema (`session_status`); legacy DB falls back to `status`. */
export const SESSIONS_OVERLAP_SELECT = "id, start_time, end_time, session_status";

/** Booking statuses that mean a live shift is still in progress — hide stale completed sessions. */
export const LIVE_BOOKING_STATUSES_FOR_SESSION_UI = new Set([
  "pending",
  "approved",
  "sitter_started",
  "parent_started",
  "in_progress",
  "sitter_ended"
]);

/**
 * Protocol Double-Shake session columns — production uses `parent_id` (never `user_id`).
 * Never `.select("*")` on client dashboards; optional columns may 400 on drifted schemas.
 */
export const SESSIONS_PROTOCOL_SELECT =
  "id, parent_id, sitter_id, status, start_time, end_time, final_elapsed_seconds, final_amount_nis, end_requested, end_confirmed, start_confirmed, parent_end_requested_at, sitter_end_confirmed_at";

export const SESSIONS_PROTOCOL_SELECT_MINIMAL =
  "id, parent_id, sitter_id, status, start_time, end_time, start_confirmed, parent_end_requested_at";

export const SESSIONS_PROTOCOL_SELECT_CORE =
  "id, parent_id, sitter_id, status, start_time, end_time";

/** Safe `.select()` after INSERT/UPDATE — never references missing legacy columns. */
export const SESSIONS_INSERT_RETURN_SELECT = SESSIONS_PROTOCOL_SELECT_MINIMAL;

const SESSION_SELECT_FALLBACK_CHAIN = [
  SESSIONS_PROTOCOL_SELECT,
  SESSIONS_PROTOCOL_SELECT_MINIMAL,
  SESSIONS_PROTOCOL_SELECT_CORE
] as const;

let cachedSessionsProtocolSelect: string | null = null;

/** Resolved select list — downgrades to minimal columns after first missing-column 400. */
export function getSessionsProtocolSelect(): string {
  return cachedSessionsProtocolSelect ?? SESSIONS_PROTOCOL_SELECT;
}

/** Optional legacy column — absent on production until migration is applied. */
export function readSessionLinkedBookingId(
  row: SupabaseSessionRow | null | undefined,
  fallbackBookingId?: string | null
): string {
  const fromRow = row?.booking_id;
  if (fromRow != null && String(fromRow).trim()) return String(fromRow);
  return fallbackBookingId?.trim() ?? "";
}

type SessionBookingQuery = {
  parentId: string;
  bookingId: string;
  status?: string;
  statuses?: string[];
  completedOnly?: boolean;
  orderBy?: "created_at" | "end_time";
  ascending?: boolean;
};

type SessionRowQuery = {
  parentId: string;
  statuses?: string[];
  completedOnly?: boolean;
  orderBy?: "created_at" | "end_time";
  ascending?: boolean;
};

function applySessionFilters(
  request: ReturnType<SupabaseClient["from"]>,
  query: SessionBookingQuery | SessionRowQuery
) {
  let next = request;
  if ("status" in query && query.status) {
    next = next.eq("status", query.status);
  }
  if (query.statuses?.length) {
    next = next.in("status", query.statuses);
  }
  if (query.completedOnly) {
    next = next.eq("status", "completed").not("end_time", "is", null);
  }
  return next;
}

async function selectSessionMaybeSingle(
  supabase: SupabaseClient,
  build: (select: string) => ReturnType<SupabaseClient["from"]>
): Promise<{ row: SupabaseSessionRow | null; error: string | null }> {
  let lastError: string | null = null;

  for (const select of SESSION_SELECT_FALLBACK_CHAIN) {
    const read = safeSupabaseRead(
      await build(select).maybeSingle(),
      "sessions protocol select"
    );

    if (!read.error) {
      cachedSessionsProtocolSelect = select;
      return { row: (read.data as SupabaseSessionRow | null) ?? null, error: null };
    }

    lastError = read.error;
    if (
      isPostgrestMissingColumnError(read.error, "user_id") ||
      isPostgrestMissingColumnError(read.error, "booking_id") ||
      isPostgrestMissingColumnError(read.error, "sitter_end_confirmed_at")
    ) {
      continue;
    }
    break;
  }

  return { row: null, error: lastError };
}

/** Insert a session row and return the created row using a safe column list. */
export async function insertSessionReturningRow(
  supabase: SupabaseClient,
  payload: Record<string, unknown>
): Promise<{ row: SupabaseSessionRow | null; error: string | null }> {
  let lastError: string | null = null;

  for (const select of SESSION_SELECT_FALLBACK_CHAIN) {
    const read = safeSupabaseRead(
      await supabase.from(SESSIONS_TABLE).insert(payload).select(select).single(),
      "session insert return"
    );

    if (!read.error && read.data) {
      cachedSessionsProtocolSelect = select;
      return { row: read.data as SupabaseSessionRow, error: null };
    }

    lastError = read.error;
    if (
      read.schemaDrift ||
      isPostgrestMissingColumnError(read.error ?? "", "user_id") ||
      isPostgrestMissingColumnError(read.error ?? "", "sitter_end_confirmed_at")
    ) {
      continue;
    }
    break;
  }

  return { row: null, error: lastError };
}

const PARENT_ARRIVAL_ACTIVATE_PAYLOADS = (startIso: string): Record<string, unknown>[] => [
  {
    status: "active",
    start_time: startIso,
    start_confirmed: true,
    session_status: "in_progress",
    parent_start_shake: startIso
  },
  {
    status: "active",
    start_time: startIso,
    start_confirmed: true,
    session_status: "active",
    parent_start_shake: startIso
  },
  {
    status: "active",
    start_time: startIso,
    start_confirmed: true
  }
];

/** Parent confirmed sitter arrival — activate session row (insert or update) with safe fallbacks. */
export async function activateParentConfirmedSession(
  supabase: SupabaseClient,
  params: {
    parentId: string;
    sitterId: string;
    bookingId: string;
    startIso: string;
  }
): Promise<{ row: SupabaseSessionRow | null; error: string | null }> {
  const { row: existing } = await fetchSessionForBooking(supabase, {
    parentId: params.parentId,
    bookingId: params.bookingId,
    statuses: [...SESSION_PENDING_START_STATUSES, "active"],
    orderBy: "created_at",
    ascending: false
  });

  let lastError: string | null = null;

  for (const payload of PARENT_ARRIVAL_ACTIVATE_PAYLOADS(params.startIso)) {
    if (existing?.id) {
      const updated = await updateSessionReturningRow(
        supabase,
        String(existing.id),
        payload,
        { parentId: params.parentId }
      );
      if (updated.row) {
        return updated;
      }
      lastError = updated.error;
    } else {
      const inserted = await insertSessionReturningRow(supabase, {
        parent_id: params.parentId,
        sitter_id: params.sitterId,
        ...payload
      });
      if (inserted.row) {
        return inserted;
      }
      lastError = inserted.error;
    }
  }

  return { row: null, error: lastError };
}

/** Update a session row and return the updated row using a safe column list. */
export async function updateSessionReturningRow(
  supabase: SupabaseClient,
  sessionId: string,
  payload: Record<string, unknown>,
  filters?: { parentId?: string }
): Promise<{ row: SupabaseSessionRow | null; error: string | null }> {
  let lastError: string | null = null;

  for (const select of SESSION_SELECT_FALLBACK_CHAIN) {
    let request = supabase.from(SESSIONS_TABLE).update(payload).eq("id", sessionId).select(select);
    if (filters?.parentId) {
      request = request.eq("parent_id", filters.parentId);
    }

    const read = safeSupabaseRead(await request.single(), "session update return");

    if (!read.error && read.data) {
      cachedSessionsProtocolSelect = select;
      return { row: read.data as SupabaseSessionRow, error: null };
    }

    lastError = read.error;
    if (
      read.schemaDrift ||
      isPostgrestMissingColumnError(read.error ?? "", "user_id") ||
      isPostgrestMissingColumnError(read.error ?? "", "sitter_end_confirmed_at")
    ) {
      continue;
    }
    break;
  }

  return { row: null, error: lastError };
}

/** Latest parent session row — safe column list, never filters on missing `booking_id`. */
export async function fetchLatestParentSessionRow(
  supabase: SupabaseClient,
  parentId: string,
  query: Omit<SessionRowQuery, "parentId">
): Promise<{ row: SupabaseSessionRow | null; error: string | null }> {
  const orderColumn = query.orderBy ?? (query.completedOnly ? "end_time" : "created_at");
  return selectSessionMaybeSingle(supabase, (select) => {
    let request = supabase
      .from(SESSIONS_TABLE)
      .select(select)
      .eq("parent_id", parentId);
    request = applySessionFilters(request, query);
    return request.order(orderColumn, { ascending: query.ascending ?? false }).limit(1);
  });
}

/**
 * Resolve sessions for a booking via `parent_id` + booking's `sitter_id`.
 * Production DB has no `sessions.booking_id` — never query that column.
 */
export async function fetchSessionForBooking(
  supabase: SupabaseClient,
  query: SessionBookingQuery
): Promise<{ row: SupabaseSessionRow | null; error: string | null }> {
  const bookingId = query.bookingId.trim();
  if (!bookingId) return { row: null, error: null };
  return querySessionsByParticipants(supabase, query);
}

async function querySessionsByParticipants(
  supabase: SupabaseClient,
  query: SessionBookingQuery
): Promise<{ row: SupabaseSessionRow | null; error: string | null }> {
  const bookingRead = safeSupabaseRead(
    await supabase
      .from(BOOKINGS_TABLE)
      .select("id, sitter_id")
      .eq("id", query.bookingId)
      .maybeSingle(),
    "booking sitter_id for session lookup"
  );

  if (bookingRead.error && !bookingRead.schemaDrift) {
    return { row: null, error: bookingRead.error };
  }

  const sitterId =
    bookingRead.data?.sitter_id != null ? String(bookingRead.data.sitter_id).trim() : "";
  if (!sitterId) {
    return { row: null, error: null };
  }

  const orderColumn = query.orderBy ?? (query.completedOnly ? "end_time" : "created_at");
  return selectSessionMaybeSingle(supabase, (select) => {
    let request = supabase
      .from(SESSIONS_TABLE)
      .select(select)
      .eq("parent_id", query.parentId)
      .eq("sitter_id", sitterId);
    request = applySessionFilters(request, query);
    return request.order(orderColumn, { ascending: query.ascending ?? false }).limit(1);
  });
}
