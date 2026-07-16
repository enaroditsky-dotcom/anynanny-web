import type { SupabaseClient } from "@supabase/supabase-js";
import { todayDateISO } from "@/lib/bookings/booking-date-utils";
import { BOOKINGS_TABLE, type BookingStatus } from "@/lib/bookings/constants";
import { SESSIONS_TABLE } from "@/lib/session/protocol";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";

export type ReleaseStuckShiftResult = {
  sessionsDeleted: number;
  bookingsDeleted: number;
  error: string | null;
};

const TERMINAL_SESSION_STATUSES = new Set(["completed", "cancelled"]);
const TERMINAL_SESSION_BILLING_STATUSES = new Set(["paid", "completed"]);

export const STUCK_BOOKING_STATUSES: BookingStatus[] = [
  "pending",
  "approved",
  "sitter_started",
  "parent_started",
  "sitter_ended"
];

type SessionDeleteRow = {
  id: string | number;
  status?: string | null;
  session_status?: string | null;
};

function isStuckSessionRow(row: SessionDeleteRow): boolean {
  const status = String(row.status ?? "").toLowerCase();
  if (TERMINAL_SESSION_STATUSES.has(status)) return false;

  const sessionStatus =
    row.session_status != null ? String(row.session_status).toLowerCase() : "";
  if (sessionStatus && TERMINAL_SESSION_BILLING_STATUSES.has(sessionStatus)) {
    return false;
  }

  return true;
}

async function loadStuckSessionRows(
  supabase: SupabaseClient,
  participantColumn: "parent_id" | "sitter_id",
  userId: string
): Promise<{ rows: SessionDeleteRow[]; error: string | null }> {
  const withBilling = await supabase
    .from(SESSIONS_TABLE)
    .select("id, status, session_status")
    .eq(participantColumn, userId);

  if (!withBilling.error) {
    return { rows: (withBilling.data ?? []) as SessionDeleteRow[], error: null };
  }

  if (!isPostgrestMissingColumnError(withBilling.error.message, "session_status")) {
    return { rows: [], error: withBilling.error.message };
  }

  const legacy = await supabase
    .from(SESSIONS_TABLE)
    .select("id, status")
    .eq(participantColumn, userId);

  if (legacy.error) {
    return { rows: [], error: legacy.error.message };
  }

  return { rows: (legacy.data ?? []) as SessionDeleteRow[], error: null };
}

async function deleteStuckSessions(
  supabase: SupabaseClient,
  participantColumn: "parent_id" | "sitter_id",
  userId: string
): Promise<{ deleted: number; error: string | null }> {
  const { rows, error } = await loadStuckSessionRows(supabase, participantColumn, userId);
  if (error) return { deleted: 0, error };

  const ids = rows.filter(isStuckSessionRow).map((row) => row.id);
  if (ids.length === 0) return { deleted: 0, error: null };

  const { error: deleteError } = await supabase
    .from(SESSIONS_TABLE)
    .delete()
    .in("id", ids)
    .eq(participantColumn, userId);

  if (deleteError) return { deleted: 0, error: deleteError.message };
  return { deleted: ids.length, error: null };
}

async function deleteStuckBookings(
  supabase: SupabaseClient,
  participantColumn: "parent_id" | "sitter_id",
  userId: string
): Promise<{ deleted: number; error: string | null }> {
  const today = todayDateISO();
  const { data, error } = await supabase
    .from(BOOKINGS_TABLE)
    .select("id")
    .eq(participantColumn, userId)
    .eq("booking_date", today)
    .in("status", STUCK_BOOKING_STATUSES);

  if (error) return { deleted: 0, error: error.message };

  const ids = (data ?? []).map((row) => row.id);
  if (ids.length === 0) return { deleted: 0, error: null };

  const { error: deleteError } = await supabase
    .from(BOOKINGS_TABLE)
    .delete()
    .in("id", ids)
    .eq(participantColumn, userId);

  if (deleteError) return { deleted: 0, error: deleteError.message };
  return { deleted: ids.length, error: null };
}

/**
 * Deletes non-terminal sessions and today's open bookings for a participant.
 * Sessions are removed first so booking FK constraints stay satisfied.
 */
export async function releaseStuckShift(
  supabase: SupabaseClient,
  participantColumn: "parent_id" | "sitter_id",
  userId: string
): Promise<ReleaseStuckShiftResult> {
  const warnings: string[] = [];
  let sessionsDeleted = 0;
  let bookingsDeleted = 0;

  const sessionResult = await deleteStuckSessions(supabase, participantColumn, userId);
  if (sessionResult.error) {
    warnings.push(sessionResult.error);
  } else {
    sessionsDeleted = sessionResult.deleted;
  }

  const bookingResult = await deleteStuckBookings(supabase, participantColumn, userId);
  if (bookingResult.error) {
    warnings.push(bookingResult.error);
  } else {
    bookingsDeleted = bookingResult.deleted;
  }

  if (warnings.length > 0) {
    console.warn("[releaseStuckShift]", warnings.join(" | "));
  }

  const didWork = sessionsDeleted > 0 || bookingsDeleted > 0;

  return {
    sessionsDeleted,
    bookingsDeleted,
    error: didWork ? null : warnings[0] ?? null
  };
}
