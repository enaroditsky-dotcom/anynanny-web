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

/** RPC / function missing from production — surfaces as 404 or PGRST202. */
export function isPostgrestMissingFunctionError(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("could not find the function") ||
    m.includes("function public.") ||
    m.includes("pgrst202") ||
    m.includes("404") ||
    (m.includes("not found") && m.includes("function"))
  );
}

export function readSupabaseErrorMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

/** True for missing column / missing RPC / stale schema cache — safe to fallback. */
export function isPostgrestSchemaDriftError(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    isPostgrestMissingFunctionError(message) ||
    m.includes("schema cache") ||
    m.includes("could not find") ||
    m.includes("does not exist") ||
    m.includes("unknown column")
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
