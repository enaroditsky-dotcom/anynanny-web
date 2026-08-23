import type { SupabaseClient } from "@supabase/supabase-js";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

/** Terms of Service document version. Unchanged by Privacy Policy text updates. */
export const LEGAL_DOC_VERSION = "1.0" as const;
export const TERMS_DOC_VERSION = LEGAL_DOC_VERSION;
/** Privacy Policy document version. Bumped when substantive privacy text changes. */
export const PRIVACY_DOC_VERSION = "1.1" as const;

export type LegalAcceptanceRecord = {
  terms_accepted_at: string;
  terms_version: string;
  privacy_accepted_at: string;
  privacy_version: string;
};

export function createLegalAcceptanceRecord(
  acceptedAt = new Date().toISOString()
): LegalAcceptanceRecord {
  return {
    terms_accepted_at: acceptedAt,
    terms_version: TERMS_DOC_VERSION,
    privacy_accepted_at: acceptedAt,
    privacy_version: PRIVACY_DOC_VERSION
  };
}

/**
 * Fill legal columns only when they are still NULL.
 * Does not overwrite a prior first-role acceptance timestamp/version.
 */
export async function persistLegalAcceptanceIfUnset(
  supabase: SupabaseClient,
  userId: string,
  record: LegalAcceptanceRecord
): Promise<{ error: string | null }> {
  const existing = await supabase
    .from(PROFILES_TABLE)
    .select("terms_accepted_at, privacy_accepted_at")
    .eq("id", userId)
    .maybeSingle();

  if (existing.error) {
    if (
      isPostgrestMissingColumnError(existing.error.message, "terms_accepted_at") ||
      isPostgrestMissingColumnError(existing.error.message, "privacy_accepted_at")
    ) {
      return { error: null };
    }
    return { error: existing.error.message };
  }

  const row = (existing.data ?? {}) as {
    terms_accepted_at?: string | null;
    privacy_accepted_at?: string | null;
  };

  const patch: Record<string, unknown> = {};
  if (!row.terms_accepted_at?.trim()) {
    patch.terms_accepted_at = record.terms_accepted_at;
    patch.terms_version = record.terms_version;
  }
  if (!row.privacy_accepted_at?.trim()) {
    patch.privacy_accepted_at = record.privacy_accepted_at;
    patch.privacy_version = record.privacy_version;
  }

  if (Object.keys(patch).length === 0) {
    return { error: null };
  }

  const { error } = await supabase.from(PROFILES_TABLE).update(patch).eq("id", userId);
  if (error) {
    if (
      isPostgrestMissingColumnError(error.message, "terms_accepted_at") ||
      isPostgrestMissingColumnError(error.message, "privacy_accepted_at")
    ) {
      return { error: null };
    }
    return { error: error.message };
  }

  return { error: null };
}
