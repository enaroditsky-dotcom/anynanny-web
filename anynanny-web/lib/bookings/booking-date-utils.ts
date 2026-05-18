/** Local calendar date as YYYY-MM-DD (matches Postgres `date` column). */
export function todayDateISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isBookingDateToday(bookingDate: string): boolean {
  return bookingDate.slice(0, 10) === todayDateISO();
}
