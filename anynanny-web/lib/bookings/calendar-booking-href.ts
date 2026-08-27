export function calendarBookingHref(
  pathname: string,
  bookingId?: string | null
): string {
  const id = String(bookingId ?? "").trim();
  if (!id) return pathname;
  return `${pathname}?bookingId=${encodeURIComponent(id)}`;
}
