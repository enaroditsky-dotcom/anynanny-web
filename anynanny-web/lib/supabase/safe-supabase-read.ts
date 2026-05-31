import type { PostgrestError } from "@supabase/supabase-js";
import {
  isPostgrestSchemaDriftError,
  readSupabaseErrorMessage
} from "@/lib/supabase/postgrest-schema";

export type SafeSupabaseReadResult<T> = {
  data: T | null;
  error: string | null;
  /** When true the caller should use a fallback path instead of blocking UI. */
  schemaDrift: boolean;
};

/** Normalize Supabase `{ data, error }` without throwing — never freezes React state. */
export function safeSupabaseRead<T>(
  result: { data: T | null; error: PostgrestError | null },
  context?: string
): SafeSupabaseReadResult<T> {
  if (result.error) {
    const message = readSupabaseErrorMessage(result.error);
    const schemaDrift = isPostgrestSchemaDriftError(message);
    if (context && !schemaDrift) {
      console.warn(`[safe-supabase-read] ${context}:`, message);
    }
    return { data: null, error: message, schemaDrift };
  }
  return { data: result.data ?? null, error: null, schemaDrift: false };
}

/** Run an async Supabase read; catch network/throw errors so UI keeps rendering. */
export async function safeSupabaseReadAsync<T>(
  fn: () => Promise<{ data: T | null; error: PostgrestError | null }>,
  context?: string
): Promise<SafeSupabaseReadResult<T>> {
  try {
    return safeSupabaseRead(await fn(), context);
  } catch (error) {
    const message = readSupabaseErrorMessage(error);
    if (context) {
      console.warn(`[safe-supabase-read] ${context}:`, message);
    }
    return { data: null, error: message, schemaDrift: isPostgrestSchemaDriftError(message) };
  }
}
