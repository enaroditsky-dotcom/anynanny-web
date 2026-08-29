import type { BookingStatus } from "@/lib/bookings/constants";

export type BookingStatusInput = BookingStatus | { name?: BookingStatus | string } | null | undefined;

/** Legacy / UI aliases mapped onto canonical booking statuses in `bookings.status`. */
const BOOKING_STATUS_ALIASES: Record<string, BookingStatus> = {
  requested: "pending",
  confirmed: "approved",
  active: "parent_started",
  in_progress: "parent_started"
};

function coerceBookingStatus(raw: string): BookingStatus | undefined {
  const mapped = BOOKING_STATUS_ALIASES[raw] ?? raw;
  const allowed: BookingStatus[] = [
    "pending",
    "approved",
    "rejected",
    "cancelled",
    "sitter_started",
    "parent_started",
    "sitter_ended",
    "completed",
    "awaiting_missed_shift_reason",
    "did_not_occur",
    "happened_unverified",
    "missed_shift_disputed"
  ];
  return (allowed as string[]).includes(mapped) ? (mapped as BookingStatus) : undefined;
}

/** Normalize Supabase/plain status values — realtime may send `{ name: "approved" }`. */
export function normalizeBookingStatus(status: BookingStatusInput): BookingStatus | undefined {
  if (status == null) return undefined;

  if (typeof status === "object") {
    const name = status.name;
    return typeof name === "string" ? coerceBookingStatus(name) : undefined;
  }

  return typeof status === "string" ? coerceBookingStatus(status) : undefined;
}
