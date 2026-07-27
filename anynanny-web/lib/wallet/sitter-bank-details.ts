import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findIsraelBankByCode,
  findIsraelBankByName,
  israelBankNameOptions,
  normalizeBankCode,
  syncBankFieldsFromCode,
  syncBankFieldsFromName
} from "@/lib/geo/israel-banks";
import {
  SITTER_PROFILES_TABLE,
  SITTER_PROFILES_USER_COLUMN
} from "@/lib/sitter/sitter-profile";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";

export type SitterBankDetails = {
  bank_code: string;
  bank_name: string;
  bank_branch: string;
  bank_account_number: string;
};

export const EMPTY_SITTER_BANK_DETAILS: SitterBankDetails = {
  bank_code: "",
  bank_name: "",
  bank_branch: "",
  bank_account_number: ""
};

function normalizeField(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

/** Normalize + keep bank_code / bank_name synchronized when one side is known. */
export function sanitizeSitterBankDetails(input: Partial<SitterBankDetails>): SitterBankDetails {
  let bank_name = normalizeField(input.bank_name, 80);
  let bank_code = normalizeBankCode(input.bank_code);

  if (bank_name && !bank_code) {
    const synced = syncBankFieldsFromName(bank_name);
    bank_code = synced.bank_code;
  } else if (bank_code && !bank_name) {
    const synced = syncBankFieldsFromCode(bank_code);
    bank_name = synced.bank_name;
  } else if (bank_name && bank_code) {
    const byName = findIsraelBankByName(bank_name);
    const byCode = findIsraelBankByCode(bank_code);
    // Prefer explicit name selection; ensure code matches that bank when possible.
    if (byName) {
      bank_code = byName.code;
      bank_name = byName.name;
    } else if (byCode) {
      bank_code = byCode.code;
      bank_name = byCode.name;
    }
  }

  return {
    bank_code,
    bank_name,
    bank_branch: normalizeField(input.bank_branch, 40),
    bank_account_number: normalizeField(input.bank_account_number, 40).replace(/\s+/g, "")
  };
}

export function validateSitterBankDetails(details: SitterBankDetails): string | null {
  if (!details.bank_name) return "נא לבחור בנק מהרשימה.";
  if (!details.bank_code) return "נא לבחור מספר בנק.";

  const allowedNames = new Set(israelBankNameOptions(details.bank_name));
  if (!allowedNames.has(details.bank_name)) return "נא לבחור בנק מהרשימה.";

  const byName = findIsraelBankByName(details.bank_name);
  if (byName && byName.code !== details.bank_code) {
    return "מספר הבנק ושם הבנק אינם תואמים.";
  }

  if (!details.bank_branch) return "נא להזין מספר / שם סניף.";
  if (!details.bank_account_number) return "נא להזין מספר חשבון.";
  if (!/^[0-9\-]+$/.test(details.bank_account_number)) {
    return "מספר חשבון יכול להכיל ספרות ומקפים בלבד.";
  }
  return null;
}

function isBankSchemaMissing(message: string | undefined): boolean {
  const msg = message ?? "";
  return (
    isPostgrestMissingColumnError(msg, "bank_name") ||
    isPostgrestMissingColumnError(msg, "bank_code") ||
    isPostgrestMissingColumnError(msg, "bank_branch") ||
    isPostgrestMissingColumnError(msg, "bank_account_number") ||
    /Could not find the table/i.test(msg) ||
    /PGRST205/i.test(msg)
  );
}

export async function fetchSitterBankDetails(
  supabase: SupabaseClient,
  sitterId: string
): Promise<{ details: SitterBankDetails; error: string | null; missingSchema: boolean }> {
  const { data, error } = await supabase
    .from(SITTER_PROFILES_TABLE)
    .select("bank_code, bank_name, bank_branch, bank_account_number")
    .eq(SITTER_PROFILES_USER_COLUMN, sitterId)
    .maybeSingle();

  if (error) {
    // Older schema without bank_code — fall back to name-only columns.
    if (isPostgrestMissingColumnError(error.message, "bank_code")) {
      const fallback = await supabase
        .from(SITTER_PROFILES_TABLE)
        .select("bank_name, bank_branch, bank_account_number")
        .eq(SITTER_PROFILES_USER_COLUMN, sitterId)
        .maybeSingle();

      if (fallback.error) {
        return {
          details: { ...EMPTY_SITTER_BANK_DETAILS },
          error: fallback.error.message,
          missingSchema: isBankSchemaMissing(fallback.error.message)
        };
      }

      return {
        details: sanitizeSitterBankDetails({
          bank_name: (fallback.data as { bank_name?: string | null } | null)?.bank_name ?? "",
          bank_branch: (fallback.data as { bank_branch?: string | null } | null)?.bank_branch ?? "",
          bank_account_number:
            (fallback.data as { bank_account_number?: string | null } | null)?.bank_account_number ??
            ""
        }),
        error: null,
        missingSchema: false
      };
    }

    return {
      details: { ...EMPTY_SITTER_BANK_DETAILS },
      error: error.message,
      missingSchema: isBankSchemaMissing(error.message)
    };
  }

  return {
    details: sanitizeSitterBankDetails({
      bank_code: (data as { bank_code?: string | null } | null)?.bank_code ?? "",
      bank_name: (data as { bank_name?: string | null } | null)?.bank_name ?? "",
      bank_branch: (data as { bank_branch?: string | null } | null)?.bank_branch ?? "",
      bank_account_number:
        (data as { bank_account_number?: string | null } | null)?.bank_account_number ?? ""
    }),
    error: null,
    missingSchema: false
  };
}

export async function saveSitterBankDetails(
  supabase: SupabaseClient,
  sitterId: string,
  input: Partial<SitterBankDetails>
): Promise<{ ok: true; details: SitterBankDetails } | { ok: false; error: string; missingSchema?: boolean }> {
  const details = sanitizeSitterBankDetails(input);
  const validationError = validateSitterBankDetails(details);
  if (validationError) return { ok: false, error: validationError };

  const patch = {
    bank_code: details.bank_code,
    bank_name: details.bank_name,
    bank_branch: details.bank_branch,
    bank_account_number: details.bank_account_number,
    updated_at: new Date().toISOString()
  };

  const { data: existing, error: readError } = await supabase
    .from(SITTER_PROFILES_TABLE)
    .select(SITTER_PROFILES_USER_COLUMN)
    .eq(SITTER_PROFILES_USER_COLUMN, sitterId)
    .maybeSingle();

  if (readError) {
    return {
      ok: false,
      error: readError.message,
      missingSchema: isBankSchemaMissing(readError.message)
    };
  }

  if (!existing) {
    const insertPayload =
      SITTER_PROFILES_USER_COLUMN === "id"
        ? { id: sitterId, ...patch }
        : { user_id: sitterId, id: sitterId, ...patch };

    const { error: insertError } = await supabase.from(SITTER_PROFILES_TABLE).insert(insertPayload);
    if (insertError) {
      return {
        ok: false,
        error: insertError.message,
        missingSchema: isBankSchemaMissing(insertError.message)
      };
    }
    return { ok: true, details };
  }

  const { error: updateError } = await supabase
    .from(SITTER_PROFILES_TABLE)
    .update(patch)
    .eq(SITTER_PROFILES_USER_COLUMN, sitterId);

  if (updateError) {
    return {
      ok: false,
      error: updateError.message,
      missingSchema: isBankSchemaMissing(updateError.message)
    };
  }

  return { ok: true, details };
}

/** Clear all bank payout fields on the sitter profile. */
export async function clearSitterBankDetails(
  supabase: SupabaseClient,
  sitterId: string
): Promise<{ ok: true } | { ok: false; error: string; missingSchema?: boolean }> {
  const patch = {
    bank_code: null,
    bank_name: null,
    bank_branch: null,
    bank_account_number: null,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from(SITTER_PROFILES_TABLE)
    .update(patch)
    .eq(SITTER_PROFILES_USER_COLUMN, sitterId);

  if (error) {
    return {
      ok: false,
      error: error.message,
      missingSchema: isBankSchemaMissing(error.message)
    };
  }

  return { ok: true };
}

export function hasSitterBankDetails(details: SitterBankDetails | null | undefined): boolean {
  if (!details) return false;
  return Boolean(
    details.bank_name.trim() ||
      details.bank_code.trim() ||
      details.bank_branch.trim() ||
      details.bank_account_number.trim()
  );
}
