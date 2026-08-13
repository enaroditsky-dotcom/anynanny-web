import type { SupabaseClient } from "@supabase/supabase-js";
import { isPostgrestMissingColumnError, isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";
import {
  SITTER_PROFILES_TABLE,
  SITTER_PROFILES_USER_COLUMN
} from "@/lib/sitter/sitter-profile";
import { isValidIsraeliId, normalizeIsraeliId } from "@/lib/wallet/sitter-payout-methods";

export type IdentityVerificationStatus = "unverified" | "pending" | "verified" | "failed";
export type IdentityVerificationRole = "parent" | "sitter";

export type IdentityVerificationRecord = {
  status: IdentityVerificationStatus;
  verifiedAt: string | null;
  method: string | null;
  idNumber: string;
};

export const EMPTY_IDENTITY_VERIFICATION: IdentityVerificationRecord = {
  status: "unverified",
  verifiedAt: null,
  method: null,
  idNumber: ""
};

/** Reserved for Phase 2 after a real HYP/SHVA card/ID match. Do not set in Phase 1. */
export const IDENTITY_VERIFICATION_METHOD_CARD_ID_MATCH = "card_id_match";

const PROFILE_SELECT =
  "identity_verification_status, identity_verified_at, identity_verification_method, identity_id_number";

const IDENTITY_VERIFICATION_ATTEMPTS_TABLE = "identity_verification_attempts";

export function parseIdentityVerificationStatus(raw: unknown): IdentityVerificationStatus {
  const value = String(raw ?? "").trim();
  if (value === "pending" || value === "verified" || value === "failed") return value;
  return "unverified";
}

export function isIdentityVerified(status: IdentityVerificationStatus): boolean {
  return status === "verified";
}

export function maskIsraeliId(raw: string): string {
  const digits = normalizeIsraeliId(raw);
  if (digits.length < 4) return digits ? "••••" : "";
  return `•••••${digits.slice(-4)}`;
}

export function validateIdentityIdNumber(raw: string): string | null {
  if (!raw.trim()) return "נא להזין מספר תעודת זהות.";
  if (!isValidIsraeliId(raw)) return "תעודת זהות אינה תקינה.";
  return null;
}

export function identityStatusLabel(status: IdentityVerificationStatus): string {
  if (status === "pending") return "האימות בבדיקה";
  if (status === "verified") return "זהות מאומתת";
  if (status === "failed") return "נדרש עדכון פרטים";
  return "זהות טרם אומתה";
}

/** Compact own-account dashboard copy. Failed is shown as unverified so the user can retry. */
export function identityDashboardStatusLabel(status: IdentityVerificationStatus): string {
  if (status === "pending") return "האימות בבדיקה";
  if (status === "verified") return "זהות מאומתת";
  return "זהות טרם אומתה";
}

export function isIdentityDashboardActionable(status: IdentityVerificationStatus): boolean {
  return status === "unverified" || status === "failed";
}

export function identityStatusCta(status: IdentityVerificationStatus): string | null {
  if (status === "pending") return null;
  if (status === "verified") return "עדכון פרטים";
  if (status === "failed") return "עדכון אימות";
  return "השלמת אימות";
}

function isMissingIdentitySchema(message: string | undefined): boolean {
  const msg = message ?? "";
  return (
    isPostgrestSchemaDriftError(msg) ||
    isPostgrestMissingColumnError(msg, "identity_verification_status") ||
    isPostgrestMissingColumnError(msg, "identity_id_number") ||
    isPostgrestMissingColumnError(msg, "identity_verified_at") ||
    isPostgrestMissingColumnError(msg, "identity_verification_method")
  );
}

function mapProfileRow(
  row: Record<string, unknown> | null,
  canonicalIdNumber: string
): IdentityVerificationRecord {
  if (!row) {
    return {
      ...EMPTY_IDENTITY_VERIFICATION,
      idNumber: normalizeIsraeliId(canonicalIdNumber)
    };
  }
  return {
    status: parseIdentityVerificationStatus(row.identity_verification_status),
    verifiedAt:
      typeof row.identity_verified_at === "string" && row.identity_verified_at.trim()
        ? row.identity_verified_at
        : null,
    method: String(row.identity_verification_method ?? "").trim() || null,
    idNumber: normalizeIsraeliId(canonicalIdNumber)
  };
}

/**
 * Opening HYP used to write `pending` before the user finished. Abandoned attempts
 * must not stay pending. Keep `pending` only when a HYP result was actually applied
 * (`identity_verification_attempts.completed_at` is set).
 */
async function healStalePendingIdentityStatus(
  supabase: SupabaseClient,
  userId: string
): Promise<IdentityVerificationStatus> {
  const latest = await supabase
    .from(IDENTITY_VERIFICATION_ATTEMPTS_TABLE)
    .select("completed_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest.error) {
    const completedAt = String(
      (latest.data as { completed_at?: unknown } | null)?.completed_at ?? ""
    ).trim();
    if (completedAt) return "pending";
  }

  await supabase
    .from(PROFILES_TABLE)
    .update({
      identity_verification_status: "unverified",
      updated_at: new Date().toISOString()
    })
    .eq("id", userId)
    .eq("identity_verification_status", "pending");

  return "unverified";
}

/**
 * Canonical Israeli ID:
 * - parent → profiles.identity_id_number
 * - sitter → sitter_profiles.id_number (existing compliance field)
 */
export async function fetchIdentityVerification(
  supabase: SupabaseClient,
  userId: string,
  options?: { role?: IdentityVerificationRole }
): Promise<{
  record: IdentityVerificationRecord;
  error: string | null;
  missingSchema: boolean;
}> {
  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return {
      record: { ...EMPTY_IDENTITY_VERIFICATION },
      error: error.message,
      missingSchema: isMissingIdentitySchema(error.message)
    };
  }

  const row = (data as Record<string, unknown> | null) ?? null;
  let canonicalId = String(row?.identity_id_number ?? "");

  if (options?.role === "sitter") {
    const sitterRead = await supabase
      .from(SITTER_PROFILES_TABLE)
      .select("id_number")
      .eq(SITTER_PROFILES_USER_COLUMN, userId)
      .maybeSingle();
    if (!sitterRead.error) {
      const sitterId = String((sitterRead.data as { id_number?: unknown } | null)?.id_number ?? "");
      canonicalId = sitterId || canonicalId;
    }
  }

  const record = mapProfileRow(row, canonicalId);
  if (record.status === "pending") {
    record.status = await healStalePendingIdentityStatus(supabase, userId);
  }

  return {
    record,
    error: null,
    missingSchema: false
  };
}

export async function saveIdentityVerificationDraft(
  supabase: SupabaseClient,
  input: {
    userId: string;
    idNumber: string;
    role: IdentityVerificationRole;
  }
): Promise<{
  ok: boolean;
  record?: IdentityVerificationRecord;
  error?: string;
  missingSchema?: boolean;
}> {
  const idError = validateIdentityIdNumber(input.idNumber);
  if (idError) return { ok: false, error: idError };

  const idNumber = normalizeIsraeliId(input.idNumber);
  const current = await fetchIdentityVerification(supabase, input.userId, {
    role: input.role
  });
  const idChanged = normalizeIsraeliId(current.record.idNumber) !== idNumber;

  // Saving an ID is not HYP verification. Changing the ID clears a prior match.
  // Unchanged ID keeps the current status until a real HYP result arrives.
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };
  if (idChanged) {
    payload.identity_verification_status = "unverified";
    payload.identity_verification_method = null;
    payload.identity_verified_at = null;
  }

  if (input.role === "parent") {
    payload.identity_id_number = idNumber;
  }

  const { error } = await supabase.from(PROFILES_TABLE).update(payload).eq("id", input.userId);

  if (error) {
    return {
      ok: false,
      error: error.message,
      missingSchema: isMissingIdentitySchema(error.message)
    };
  }

  if (input.role === "sitter") {
    const sitterUpdate = await supabase
      .from(SITTER_PROFILES_TABLE)
      .update({
        id_number: idNumber,
        updated_at: new Date().toISOString()
      })
      .eq(SITTER_PROFILES_USER_COLUMN, input.userId);
    if (sitterUpdate.error) {
      return { ok: false, error: sitterUpdate.error.message };
    }
  }

  const loaded = await fetchIdentityVerification(supabase, input.userId, {
    role: input.role
  });

  return {
    ok: true,
    record: loaded.record,
    missingSchema: loaded.missingSchema
  };
}
