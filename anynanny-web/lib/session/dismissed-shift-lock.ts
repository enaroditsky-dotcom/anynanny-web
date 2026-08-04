"use client";

import { normalizeBookingStatus, type BookingStatusInput } from "@/lib/bookings/use-shift-activation-status";

export function dismissedShiftStorageKey(bookingId: string): string {
  return `dismissed_shift_${bookingId}`;
}

export function isShiftLocallyDismissed(bookingId?: string | null): boolean {
  if (typeof window === "undefined" || !bookingId?.trim()) return false;
  try {
    return localStorage.getItem(dismissedShiftStorageKey(bookingId)) === "true";
  } catch {
    return false;
  }
}

export function persistShiftLocallyDismissed(bookingId: string): void {
  if (!bookingId.trim()) return;
  try {
    localStorage.setItem(dismissedShiftStorageKey(bookingId), "true");
  } catch {
    /* ignore */
  }
}

export function isBookingShiftCompleted(status: BookingStatusInput): boolean {
  const normalized = normalizeBookingStatus(status);
  if (normalized === "completed") return true;
  if (typeof status === "object" && status !== null) {
    return (status as { name?: string }).name === "completed";
  }
  return status === "completed";
}

export const SHIFT_COMPLETED_CIRCLE_LABEL = "המשמרת הסתיימה בהצלחה";

/** Shared localStorage check — key: dismissed_shift_${bookingId} */
export function readShiftDismissedFromStorage(bookingId?: string | null): boolean {
  return isShiftLocallyDismissed(bookingId);
}

export function shouldHardLockShiftBooking(
  booking: { id?: string | null; status?: BookingStatusInput } | null
): boolean {
  const isLocallyDismissed =
    typeof window !== "undefined" && booking?.id
      ? localStorage.getItem(dismissedShiftStorageKey(booking.id)) === "true"
      : readShiftDismissedFromStorage(booking?.id);

  if (isLocallyDismissed) return true;
  if (!booking?.status) return false;
  if (booking.status === "completed") return true;
  return isBookingShiftCompleted(booking.status);
}
