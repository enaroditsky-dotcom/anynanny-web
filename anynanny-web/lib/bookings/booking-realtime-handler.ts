import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { BookingRow } from "@/lib/bookings/constants";
import {
  normalizeBookingStatus,
  type BookingStatusInput
} from "@/lib/bookings/use-shift-activation-status";

/** Read the booking row from any postgres_changes payload (`INSERT` | `UPDATE` | `DELETE`). */
export function readBookingRowFromRealtimeChange(
  payload: RealtimePostgresChangesPayload<BookingRow>
): BookingRow | null {
  const row =
    payload.eventType === "DELETE"
      ? ((payload.old ?? null) as BookingRow | null)
      : ((payload.new ?? null) as BookingRow | null);

  if (!row?.id) {
    return null;
  }

  return {
    ...row,
    status: normalizeBookingStatus(row.status as BookingStatusInput) ?? row.status
  } as BookingRow;
}

export function isParentBookingRejection(status: BookingStatusInput): boolean {
  const normalized = normalizeBookingStatus(status);
  return normalized === "rejected" || normalized === "cancelled";
}

/**
 * Statuses that mount the parent tracking / start-shift circle.
 * Maps legacy aliases: `confirmed` → `approved`, `active` → `parent_started`.
 */
export function isParentBookingTrackingStatus(status: BookingStatusInput): boolean {
  const normalized = normalizeBookingStatus(status);
  return (
    normalized === "approved" ||
    normalized === "sitter_started" ||
    normalized === "parent_started" ||
    normalized === "sitter_ended"
  );
}

export function isParentBookingApprovalStatus(status: BookingStatusInput): boolean {
  return normalizeBookingStatus(status) === "approved";
}

/** Sitter must explicitly approve before any shift circle UI (`requested` → `pending`). */
export function isSitterBookingAwaitingApprovalStatus(status: BookingStatusInput): boolean {
  return normalizeBookingStatus(status) === "pending";
}

/**
 * Statuses that mount the sitter Double-Shake circle (post-approval only).
 * Legacy: `confirmed` → `approved`, `active` → `parent_started`.
 */
export function isSitterShiftCircleStatus(status: BookingStatusInput): boolean {
  const normalized = normalizeBookingStatus(status);
  return (
    normalized === "approved" ||
    normalized === "sitter_started" ||
    normalized === "parent_started" ||
    normalized === "sitter_ended"
  );
}
