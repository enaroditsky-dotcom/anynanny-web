import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { SESSIONS_TABLE, type SupabaseSessionRow } from "@/lib/session/protocol";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
import { safeSupabaseRead } from "@/lib/supabase/safe-supabase-read";

/** Overlap probe — only columns guaranteed to exist on every schema (status drift safe). */
export const SESSIONS_OVERLAP_SELECT = "id, start_time, end_time, status";

/** Booking statuses that mean a live shift is still in progress — hide stale completed sessions. */
export const LIVE_BOOKING_STATUSES_FOR_SESSION_UI = new Set([
  "pending",
  "approved",
  "sitter_started",
  "parent_started",
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

/** Select lists tried in order when optional session columns are missing (avoids PostgREST 400). */
export const SESSION_SELECT_FALLBACK_CHAIN = [
  SESSIONS_PROTOCOL_SELECT_MINIMAL,
  SESSIONS_PROTOCOL_SELECT_CORE
] as const;

let cachedSessionsProtocolSelect: string | null = null;

/** Resolved select list — downgrades to minimal columns after first missing-column 400. */
export function getSessionsProtocolSelect(): string {
  return cachedSessionsProtocolSelect ?? SESSIONS_PROTOCOL_SELECT_MINIMAL;
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

type SessionFilters = {
  status?: string;
  statuses?: string[];
  completedOnly?: boolean;
  orderBy?: "created_at" | "end_time";
  ascending?: boolean;
};

type SessionBookingQuery = SessionFilters & {
  parentId: string;
  bookingId: string;
};

type SessionRowQuery = SessionFilters & {
  parentId: string;
};

function applySessionFilters(
  request: any,
  query: SessionFilters
) {
  let next = request;
  if (query.status) {
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
  build: (select: string) => any
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
    // Any missing-column / schema-drift 400 → try a narrower select instead of aborting.
    if (
      read.schemaDrift ||
      isPostgrestMissingColumnError(read.error, "user_id") ||
      isPostgrestMissingColumnError(read.error, "booking_id") ||
      isPostgrestMissingColumnError(read.error, "sitter_end_confirmed_at") ||
      isPostgrestMissingColumnError(read.error, "start_confirmed") ||
      isPostgrestMissingColumnError(read.error, "parent_end_requested_at") ||
      isPostgrestMissingColumnError(read.error, "final_elapsed_seconds") ||
      isPostgrestMissingColumnError(read.error, "final_amount_nis") ||
      /column|schema cache|could not find/i.test(String(read.error))
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
    start_confirmed: true
  },
  {
    status: "active",
    start_time: startIso
  }
];

function isMissingBookingIdColumn(error: string | null): boolean {
  return isPostgrestMissingColumnError(error, "booking_id");
}

/** Merge booking_id when the column exists; callers retry without it on schema drift. */
function withBookingId(
  payload: Record<string, unknown>,
  bookingId: string,
  persist: boolean
): Record<string, unknown> {
  if (!persist || !bookingId) return payload;
  return { ...payload, booking_id: bookingId };
}

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
  const bookingId = params.bookingId.trim();
  const { row: existing } = await fetchSessionForBooking(supabase, {
    parentId: params.parentId,
    bookingId,
    statuses: ["pending", "active"],
    orderBy: "created_at",
    ascending: false
  });

  // Finished bookings must never spawn a second session row (common twin-shift source).
  if (!existing?.id) {
    const bookingRead = safeSupabaseRead(
      await supabase
        .from(BOOKINGS_TABLE)
        .select("id, status")
        .eq("id", bookingId)
        .maybeSingle(),
      "booking status before session activate"
    );
    const bookingStatus = String(
      (bookingRead.data as { status?: unknown } | null)?.status ?? ""
    )
      .trim()
      .toLowerCase();
    if (
      bookingStatus === "sitter_ended" ||
      bookingStatus === "completed" ||
      bookingStatus === "cancelled" ||
      bookingStatus === "rejected"
    ) {
      const { row: terminal } = await fetchSessionForBooking(supabase, {
        parentId: params.parentId,
        bookingId,
        statuses: ["payment_pending", "paid", "completed", "sitter_completed"],
        orderBy: "created_at",
        ascending: false
      });
      if (terminal?.id && bookingId) {
        const patched = await updateSessionReturningRow(
          supabase,
          String(terminal.id),
          { booking_id: bookingId },
          { parentId: params.parentId }
        );
        if (patched.row) return patched;
      }
      return {
        row: terminal,
        error: terminal ? null : "המשמרת כבר הסתיימה — לא נוצר סשן חדש."
      };
    }
  }

  let lastError: string | null = null;
  let persistBookingId = Boolean(bookingId);

  for (const base of PARENT_ARRIVAL_ACTIVATE_PAYLOADS(params.startIso)) {
    const payload = withBookingId(base, bookingId, persistBookingId);
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
      if (persistBookingId && isMissingBookingIdColumn(updated.error)) {
        persistBookingId = false;
        const retry = await updateSessionReturningRow(
          supabase,
          String(existing.id),
          base,
          { parentId: params.parentId }
        );
        if (retry.row) return retry;
        lastError = retry.error;
        continue;
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
      if (persistBookingId && isMissingBookingIdColumn(inserted.error)) {
        persistBookingId = false;
        const retry = await insertSessionReturningRow(supabase, {
          parent_id: params.parentId,
          sitter_id: params.sitterId,
          ...base
        });
        if (retry.row) return retry;
        lastError = retry.error;
        continue;
      }
      // Unique open-session index: another pending/active row already exists — update it.
      const uniqueHit =
        /duplicate key|unique/i.test(String(inserted.error ?? "")) ||
        String((inserted as { error?: string | null }).error ?? "").includes("23505");
      if (uniqueHit) {
        const { row: openRow } = await fetchSessionForBooking(supabase, {
          parentId: params.parentId,
          bookingId,
          statuses: ["pending", "active"],
          orderBy: "created_at",
          ascending: false
        });
        if (openRow?.id) {
          const updated = await updateSessionReturningRow(
            supabase,
            String(openRow.id),
            payload,
            { parentId: params.parentId }
          );
          if (updated.row) return updated;
          if (persistBookingId && isMissingBookingIdColumn(updated.error)) {
            persistBookingId = false;
            const retry = await updateSessionReturningRow(
              supabase,
              String(openRow.id),
              base,
              { parentId: params.parentId }
            );
            if (retry.row) return retry;
            lastError = retry.error;
            continue;
          }
          lastError = updated.error;
          continue;
        }
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
    let request: any = supabase.from(SESSIONS_TABLE).update(payload).eq("id", sessionId).select(select);
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

  const bookingData = bookingRead.data as Record<string, unknown> | null;
  const sitterId =
    bookingData?.sitter_id != null ? String(bookingData.sitter_id).trim() : "";
  if (!sitterId) {
    return { row: null, error: null };
  }

  const orderColumn = query.orderBy ?? (query.completedOnly ? "end_time" : "created_at");

  // Closure/summary lookups explicitly ask for completed rows (via `completedOnly` or a
  // `completed` entry in the requested statuses) and must keep returning older finished
  // sessions. Everything else is an "active shift" lookup: it must ignore stale rows and
  // never resurface a completed session.
  const wantsCompleted =
    Boolean(query.completedOnly) ||
    query.status === "completed" ||
    Boolean(query.statuses?.includes("completed"));

  // Only consider sessions whose start_time is within the last 24h. Rows with a null
  // start_time (created but not yet started) are kept so pending sessions still resolve.
  const recentStartIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  return selectSessionMaybeSingle(supabase, (select) => {
    let request = supabase
      .from(SESSIONS_TABLE)
      .select(select)
      .eq("parent_id", query.parentId)
      .eq("sitter_id", sitterId);
    request = applySessionFilters(request, query);
    if (!wantsCompleted) {
      // PostgREST `.or()` values with `:` must be double-quoted or the filter 400s.
      const quoted = `"${recentStartIso}"`;
      request = request
        .neq("status", "completed")
        .or(`start_time.is.null,start_time.gte.${quoted}`);
    }
    return request.order(orderColumn, { ascending: query.ascending ?? false }).limit(1);
  });
}