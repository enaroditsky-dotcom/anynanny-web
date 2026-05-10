/** Maps PostgREST / missing-column errors to a short Hebrew message (no raw DB text). */
export function friendlySupabaseSessionError(error: unknown): string {
  const raw =
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
      ? (error as { message: string }).message
      : error instanceof Error
        ? error.message
        : String(error);
  const check = raw.toLowerCase();
  if (
    check.includes("row-level security") ||
    check.includes("rls") ||
    raw.includes("42501") ||
    check.includes("permission denied")
  ) {
    return "אין הרשאה לשמירה — ודאו שמחוברים למערכת ושחוקי האבטחה (RLS) מתירים את הפעולה.";
  }
  if (
    check.includes("column") ||
    check.includes("does not exist") ||
    check.includes("schema cache") ||
    raw.includes("PGRST") ||
    check.includes("could not find")
  ) {
    return "עדכון בסיס הנתונים חסר או לא סונכרן. הרץ ריענון סכמה ב-Supabase (או NOTIFY pgrst) ונסה שוב.";
  }
  return "משהו השתבש. נסה שוב בעוד רגע.";
}
