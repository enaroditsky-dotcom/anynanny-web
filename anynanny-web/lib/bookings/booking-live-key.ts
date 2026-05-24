import type { BookingRow } from "@/lib/bookings/constants";
import { normalizeBookingStatus, type BookingStatusInput } from "@/lib/bookings/use-shift-activation-status";

function liveStatusKey(status: BookingStatusInput): string {
  return normalizeBookingStatus(status) ?? String(status ?? "");
}

/** Stable React key fragment — remount circle when live booking row changes. */
export function bookingLiveSyncKey(
  booking: Pick<BookingRow, "id" | "status" | "updated_at"> | null | undefined
): string {
  if (!booking) return "none-none-";
  return `${booking.id}${liveStatusKey(booking.status)}${booking.updated_at ?? ""}`;
}

export function didBookingLiveFieldsChange(
  prev: Pick<BookingRow, "id" | "status" | "updated_at"> | null | undefined,
  next: Pick<BookingRow, "id" | "status" | "updated_at"> | null | undefined
): boolean {
  if (!next?.id) return false;
  if (!prev?.id) return true;
  if (prev.id !== next.id) return true;
  return (
    liveStatusKey(prev.status) !== liveStatusKey(next.status) ||
    prev.updated_at !== next.updated_at
  );
}
