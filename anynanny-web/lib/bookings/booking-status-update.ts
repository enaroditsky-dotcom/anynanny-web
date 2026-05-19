import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKINGS_TABLE, type BookingRow, type BookingStatus } from "@/lib/bookings/constants";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";

/** Columns present on the base `bookings` table (no optional migration columns). */
export const BOOKING_SELECT_MINIMAL =
  "id, parent_id, sitter_id, booking_date, start_time, end_time, status, created_at, updated_at" as const;

const TERMINAL_CLOSE_STATUSES: BookingStatus[] = ["completed", "cancelled"];

function isStatusConstraintError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("bookings_status_check") || m.includes("check constraint");
}

function isTerminalBookingStatus(status: string): boolean {
  return status === "completed" || status === "cancelled" || status === "rejected";
}

/** Close an in-progress booking using only `status` (+ `updated_at` when available). */
export async function closeBookingForSitter(
  supabase: SupabaseClient,
  sitterId: string,
  bookingId: string,
  allowedStatuses: BookingStatus[]
): Promise<{ row: BookingRow | null; error: string | null }> {
  const { data: existing, error: readErr } = await supabase
    .from(BOOKINGS_TABLE)
    .select(BOOKING_SELECT_MINIMAL)
    .eq("id", bookingId)
    .eq("sitter_id", sitterId)
    .maybeSingle();

  if (readErr) {
    return { row: null, error: readErr.message };
  }

  if (existing && isTerminalBookingStatus(String(existing.status))) {
    return { row: existing as BookingRow, error: null };
  }

  const now = new Date().toISOString();

  for (const terminalStatus of TERMINAL_CLOSE_STATUSES) {
    const attempt = await supabase
      .from(BOOKINGS_TABLE)
      .update({ status: terminalStatus, updated_at: now })
      .eq("id", bookingId)
      .eq("sitter_id", sitterId)
      .in("status", allowedStatuses)
      .select(BOOKING_SELECT_MINIMAL)
      .maybeSingle();

    if (!attempt.error && attempt.data) {
      return { row: attempt.data as BookingRow, error: null };
    }

    if (attempt.error) {
      const msg = attempt.error.message;
      if (isPostgrestMissingColumnError(msg, "updated_at")) {
        const withoutUpdated = await supabase
          .from(BOOKINGS_TABLE)
          .update({ status: terminalStatus })
          .eq("id", bookingId)
          .eq("sitter_id", sitterId)
          .in("status", allowedStatuses)
          .select(BOOKING_SELECT_MINIMAL)
          .maybeSingle();
        if (!withoutUpdated.error && withoutUpdated.data) {
          return { row: withoutUpdated.data as BookingRow, error: null };
        }
        if (withoutUpdated.error && !isStatusConstraintError(withoutUpdated.error.message)) {
          return { row: null, error: withoutUpdated.error.message };
        }
      } else if (!isStatusConstraintError(msg)) {
        return { row: null, error: msg };
      }
    }
  }

  for (const terminalStatus of TERMINAL_CLOSE_STATUSES) {
    const force = await supabase
      .from(BOOKINGS_TABLE)
      .update({ status: terminalStatus })
      .eq("id", bookingId)
      .eq("sitter_id", sitterId)
      .select(BOOKING_SELECT_MINIMAL)
      .maybeSingle();

    if (!force.error && force.data) {
      return { row: force.data as BookingRow, error: null };
    }
  }

  const { data: after } = await supabase
    .from(BOOKINGS_TABLE)
    .select(BOOKING_SELECT_MINIMAL)
    .eq("id", bookingId)
    .eq("sitter_id", sitterId)
    .maybeSingle();

  if (after && isTerminalBookingStatus(String(after.status))) {
    return { row: after as BookingRow, error: null };
  }

  return {
    row: null,
    error: "לא ניתן לסגור את המשמרת — ייתכן שהסטטוס כבר עודכן או שאינו במצב פעיל."
  };
}
