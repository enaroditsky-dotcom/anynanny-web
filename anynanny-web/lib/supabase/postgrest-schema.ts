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
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint, record.code]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .map((part) => part.trim());
    if (parts.length > 0) return parts.join(" — ");
    if (typeof record.status === "number") return `HTTP ${record.status}`;
    if (typeof record.statusCode === "number") return `HTTP ${record.statusCode}`;
  }
  return String(error);
}

/** PostgREST RPC missing or unreachable (404 / PGRST202 / stale function name). */
export function isSupabaseRpcUnavailableError(error: unknown): boolean {
  if (!error) return false;
  const message = readSupabaseErrorMessage(error);
  if (isPostgrestMissingFunctionError(message)) return true;

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code.toUpperCase() : "";
    if (code === "PGRST202" || code === "42883") return true;
    const status =
      typeof record.status === "number"
        ? record.status
        : typeof record.statusCode === "number"
          ? record.statusCode
          : null;
    if (status === 404) return true;
  }

  const lower = message.toLowerCase();
  return lower.includes("404") || (lower.includes("not found") && lower.includes("rpc"));
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
