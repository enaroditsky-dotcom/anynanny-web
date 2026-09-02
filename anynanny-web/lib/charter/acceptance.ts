import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CHARTER_ACCEPTANCES_TABLE,
  currentCharterVersion,
  isCharterType,
  isCurrentCharterVersion,
  type CharterType
} from "@/lib/charter/versions";
import { isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";

export const CHARTER_ACCEPTANCE_ERROR =
  "לא הצלחנו לשמור את האישור. נסו שוב בעוד רגע.";

export type CharterAcceptanceRecord = {
  user_id: string;
  charter_type: CharterType;
  charter_version: string;
  accepted_at: string;
};

export type PersistCharterAcceptanceInput = {
  userId: string;
  charterType: CharterType;
  acceptedAt?: string;
};

export function buildCharterAcceptanceRecord(
  input: PersistCharterAcceptanceInput
): CharterAcceptanceRecord {
  return {
    user_id: input.userId,
    charter_type: input.charterType,
    charter_version: currentCharterVersion(input.charterType),
    accepted_at: input.acceptedAt ?? new Date().toISOString()
  };
}

export function parseCharterAcceptBody(body: unknown): { charterType: CharterType } | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "בקשה לא תקינה." };
  }
  const charterType = (body as { charterType?: unknown; charter_type?: unknown }).charterType
    ?? (body as { charter_type?: unknown }).charter_type;
  if (typeof charterType !== "string" || !isCharterType(charterType)) {
    return { error: "סוג האמנה אינו תקין." };
  }
  return { charterType };
}

export function isDuplicateCharterAcceptanceError(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("duplicate") ||
    m.includes("unique") ||
    m.includes("user_charter_acceptances_user_type_version") ||
    m.includes("23505")
  );
}

export function isMissingCharterTableError(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes(CHARTER_ACCEPTANCES_TABLE) &&
    (isPostgrestSchemaDriftError(message) || m.includes("relation") || m.includes("does not exist"))
  );
}

export async function hasAcceptedCurrentCharter(
  supabase: SupabaseClient,
  userId: string,
  charterType: CharterType
): Promise<boolean> {
  if (!userId || !isCharterType(charterType)) return false;

  const version = currentCharterVersion(charterType);
  const { data, error } = await supabase
    .from(CHARTER_ACCEPTANCES_TABLE)
    .select("id, charter_version")
    .eq("user_id", userId)
    .eq("charter_type", charterType)
    .eq("charter_version", version)
    .maybeSingle();

  if (error) {
    return false;
  }

  const versionValue = (data as { charter_version?: string } | null)?.charter_version;
  return Boolean(versionValue && isCurrentCharterVersion(charterType, versionValue));
}

export async function persistCharterAcceptance(
  supabase: SupabaseClient,
  input: PersistCharterAcceptanceInput
): Promise<{ ok: true; alreadyAccepted?: boolean } | { ok: false; error: string }> {
  if (!input.userId) {
    return { ok: false, error: CHARTER_ACCEPTANCE_ERROR };
  }

  const record = buildCharterAcceptanceRecord(input);
  const { error } = await supabase.from(CHARTER_ACCEPTANCES_TABLE).insert({
    user_id: record.user_id,
    charter_type: record.charter_type,
    charter_version: record.charter_version,
    accepted_at: record.accepted_at
  });

  if (!error) {
    return { ok: true };
  }

  if (isDuplicateCharterAcceptanceError(error.message)) {
    return { ok: true, alreadyAccepted: true };
  }

  return { ok: false, error: CHARTER_ACCEPTANCE_ERROR };
}

export type CharterSubmitState = {
  submitting: boolean;
  accepted: boolean;
};

export function canSubmitCharterAcceptance(input: {
  checked: boolean;
  submitting: boolean;
}): boolean {
  return input.checked && !input.submitting;
}

export function beginCharterSubmit(state: CharterSubmitState): CharterSubmitState | null {
  if (state.submitting || state.accepted) return null;
  return { ...state, submitting: true };
}
