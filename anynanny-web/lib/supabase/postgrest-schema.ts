/**
 * PostgREST / Supabase JS often returns errors like:
 * "Could not find the 'role_selected' column of 'profiles' in the schema cache"
 */
export function isPostgrestMissingColumnError(message: string | null | undefined, column: string): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  const c = column.toLowerCase();
  if (!m.includes(c)) return false;
  return (
    m.includes("could not find") ||
    m.includes("does not exist") ||
    m.includes("unknown column") ||
    (m.includes("column") && m.includes("schema cache"))
  );
}

/**
 * Stale PostgREST cache often surfaces as:
 * "Could not find the 'id' column of 'sitter_profiles' in the schema cache"
 */
export function isPostgrestSitterProfilesStaleSchemaError(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes("could not find") && m.includes("id") && m.includes("sitter_profiles");
}
