import type { BookingRow } from "@/lib/bookings/constants";

export const STUCK_SHIFT_REVIEW_LABEL = "ממתינה לבדיקה";
export const STUCK_SHIFT_REVIEW_SUPPORT =
  "המשמרת הועברה לבדיקה. פרטי המשמרת נשמרו ולא בוצע חיוב נוסף.";

export type StuckShiftReviewFlag = {
  requires_admin_review?: boolean | null;
};

export function bookingRequiresAdminReview(
  booking: StuckShiftReviewFlag | null | undefined
): boolean {
  return booking?.requires_admin_review === true;
}

export function hasConfirmedDoubleShakeStart(
  session: object | null | undefined
): boolean {
  if (!session) return false;
  const row = session as {
    sitter_start_shake?: unknown;
    parent_start_shake?: unknown;
  };
  const sitter = String(row.sitter_start_shake ?? "").trim();
  const parent = String(row.parent_start_shake ?? "").trim();
  return Boolean(sitter) && Boolean(parent);
}

export function excludeStuckShiftReviewBookings<T extends StuckShiftReviewFlag>(
  rows: T[] | null | undefined
): T[] {
  return (rows ?? []).filter((row) => !bookingRequiresAdminReview(row));
}

export function stuckShiftReviewHistoryLabel(
  booking: StuckShiftReviewFlag | null | undefined
): string | null {
  return bookingRequiresAdminReview(booking) ? STUCK_SHIFT_REVIEW_LABEL : null;
}

export function isLiveShiftUiSuppressedByReview(
  booking: (Pick<BookingRow, "status"> & StuckShiftReviewFlag) | null | undefined
): boolean {
  return bookingRequiresAdminReview(booking);
}

export function sessionLinkedToReviewBooking(
  session: {
    booking_id?: string | number | null;
    parent_id?: string | null;
    sitter_id?: string | null;
  } | null | undefined,
  reviews: ReadonlySet<string> | ReadonlyArray<{ id: string; parent_id?: string | null; sitter_id?: string | null }>
): boolean {
  if (!session) return false;
  const bookingId = session.booking_id != null ? String(session.booking_id).trim() : "";
  const reviewRows = Array.isArray(reviews) ? reviews : null;
  if (!reviewRows) {
    return Boolean(bookingId) && (reviews as ReadonlySet<string>).has(bookingId);
  }
  if (bookingId && reviewRows.some((row) => row.id === bookingId)) return true;
  const parentId = session.parent_id != null ? String(session.parent_id).trim() : "";
  const sitterId = session.sitter_id != null ? String(session.sitter_id).trim() : "";
  if (!parentId || !sitterId) return false;
  return reviewRows.some(
    (row) => String(row.parent_id ?? "").trim() === parentId && String(row.sitter_id ?? "").trim() === sitterId
  );
}

/** Sitter past/history must keep review-held worked shifts, not hide them. */
export function isSitterPastHistoryBooking(row: {
  status?: string | null;
  requires_admin_review?: boolean | null;
}): boolean {
  const status = String(row.status ?? "").trim().toLowerCase();
  if (status === "completed" || status === "cancelled") return true;
  if (!bookingRequiresAdminReview(row)) return false;
  return status !== "pending" && status !== "rejected";
}
