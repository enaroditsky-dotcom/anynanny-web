import type { SupabaseClient } from "@supabase/supabase-js";
import { SITTER_PROFILES_TABLE, SITTER_PROFILES_USER_COLUMN } from "@/lib/sitter/sitter-profile";
import { isPostgrestMissingColumnError, isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";

export type SitterPayoutMethodKind = "bit" | "paybox" | "card";

export type SitterPayoutMethods = {
  preferred: SitterPayoutMethodKind | "bank" | null;
  bitPhone: string;
  payboxPhone: string;
  cardHolder: string;
  cardLast4: string;
  cardExpMonth: number | null;
  cardExpYear: number | null;
};

export const EMPTY_SITTER_PAYOUT_METHODS: SitterPayoutMethods = {
  preferred: null,
  bitPhone: "",
  payboxPhone: "",
  cardHolder: "",
  cardLast4: "",
  cardExpMonth: null,
  cardExpYear: null
};

const SELECT_COLS =
  "payout_preferred_method, payout_bit_phone, payout_paybox_phone, payout_card_holder, payout_card_last4, payout_card_exp_month, payout_card_exp_year";

function normalizePhone(raw: string): string {
  return String(raw ?? "")
    .replace(/[^\d+]/g, "")
    .replace(/^\+972/, "0")
    .trim();
}

export function isValidIsraeliMobile(phone: string): boolean {
  const digits = normalizePhone(phone).replace(/\D/g, "");
  return /^05\d{8}$/.test(digits);
}

export function formatIsraeliMobileDisplay(phone: string): string {
  const digits = normalizePhone(phone).replace(/\D/g, "");
  if (digits.length !== 10) return phone.trim();
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Accept pasted card number; return last4 only (never persist full PAN). */
export function extractCardLast4(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 4) return digits;
  return digits.slice(-4);
}

export function validateBitPhone(phone: string): string | null {
  if (!phone.trim()) return "נא להזין מספר טלפון עבור Bit.";
  if (!isValidIsraeliMobile(phone)) return "מספר Bit חייב להיות נייד ישראלי תקין (05X…).";
  return null;
}

export function validatePayboxPhone(phone: string): string | null {
  if (!phone.trim()) return "נא להזין מספר טלפון עבור PayBox.";
  if (!isValidIsraeliMobile(phone)) return "מספר PayBox חייב להיות נייד ישראלי תקין (05X…).";
  return null;
}

export function validatePayoutCard(input: {
  holder: string;
  last4OrNumber: string;
  expMonth: number | null;
  expYear: number | null;
}): string | null {
  if (!input.holder.trim()) return "נא להזין שם בעל הכרטיס.";
  const last4 = extractCardLast4(input.last4OrNumber);
  if (!/^\d{4}$/.test(last4)) return "נא להזין מספר כרטיס (יישמרו 4 ספרות אחרונות בלבד).";
  if (!input.expMonth || input.expMonth < 1 || input.expMonth > 12) return "נא לבחור חודש תוקף.";
  const year = input.expYear ?? 0;
  const nowY = new Date().getFullYear();
  if (year < nowY || year > nowY + 20) return "נא לבחור שנת תוקף תקינה.";
  return null;
}

function mapRow(row: Record<string, unknown> | null): SitterPayoutMethods {
  if (!row) return { ...EMPTY_SITTER_PAYOUT_METHODS };
  const preferredRaw = String(row.payout_preferred_method ?? "").trim();
  const preferred =
    preferredRaw === "bit" ||
    preferredRaw === "paybox" ||
    preferredRaw === "card" ||
    preferredRaw === "bank"
      ? preferredRaw
      : null;
  return {
    preferred,
    bitPhone: String(row.payout_bit_phone ?? ""),
    payboxPhone: String(row.payout_paybox_phone ?? ""),
    cardHolder: String(row.payout_card_holder ?? ""),
    cardLast4: String(row.payout_card_last4 ?? ""),
    cardExpMonth:
      row.payout_card_exp_month != null && Number.isFinite(Number(row.payout_card_exp_month))
        ? Number(row.payout_card_exp_month)
        : null,
    cardExpYear:
      row.payout_card_exp_year != null && Number.isFinite(Number(row.payout_card_exp_year))
        ? Number(row.payout_card_exp_year)
        : null
  };
}

function isMissingSchema(message: string | undefined): boolean {
  const msg = message ?? "";
  return (
    isPostgrestSchemaDriftError(msg) ||
    isPostgrestMissingColumnError(msg, "payout_bit_phone") ||
    isPostgrestMissingColumnError(msg, "payout_paybox_phone") ||
    isPostgrestMissingColumnError(msg, "payout_card_last4") ||
    /Could not find the table/i.test(msg) ||
    /PGRST205/i.test(msg)
  );
}

export async function fetchSitterPayoutMethods(
  supabase: SupabaseClient,
  sitterId: string
): Promise<{ methods: SitterPayoutMethods; error: string | null; missingSchema: boolean }> {
  const { data, error } = await supabase
    .from(SITTER_PROFILES_TABLE)
    .select(SELECT_COLS)
    .eq(SITTER_PROFILES_USER_COLUMN, sitterId)
    .maybeSingle();

  if (error) {
    return {
      methods: { ...EMPTY_SITTER_PAYOUT_METHODS },
      error: error.message,
      missingSchema: isMissingSchema(error.message)
    };
  }

  return {
    methods: mapRow((data as Record<string, unknown> | null) ?? null),
    error: null,
    missingSchema: false
  };
}

export async function saveSitterPayoutMethods(
  supabase: SupabaseClient,
  sitterId: string,
  patch: Partial<SitterPayoutMethods> & { preferred?: SitterPayoutMethodKind | "bank" | null }
): Promise<{ ok: true; methods: SitterPayoutMethods } | { ok: false; error: string; missingSchema?: boolean }> {
  const row: Record<string, unknown> = {
    payout_methods_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (patch.preferred !== undefined) {
    row.payout_preferred_method = patch.preferred;
  }
  if (patch.bitPhone !== undefined) {
    row.payout_bit_phone = normalizePhone(patch.bitPhone) || null;
  }
  if (patch.payboxPhone !== undefined) {
    row.payout_paybox_phone = normalizePhone(patch.payboxPhone) || null;
  }
  if (patch.cardHolder !== undefined) {
    row.payout_card_holder = patch.cardHolder.trim() || null;
  }
  if (patch.cardLast4 !== undefined) {
    row.payout_card_last4 = extractCardLast4(patch.cardLast4) || null;
  }
  if (patch.cardExpMonth !== undefined) {
    row.payout_card_exp_month = patch.cardExpMonth;
  }
  if (patch.cardExpYear !== undefined) {
    row.payout_card_exp_year = patch.cardExpYear;
  }

  const { data, error } = await supabase
    .from(SITTER_PROFILES_TABLE)
    .update(row)
    .eq(SITTER_PROFILES_USER_COLUMN, sitterId)
    .select(SELECT_COLS)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: error.message,
      missingSchema: isMissingSchema(error.message)
    };
  }

  return { ok: true, methods: mapRow((data as Record<string, unknown> | null) ?? null) };
}

export function payoutMethodConfigured(
  methods: SitterPayoutMethods,
  kind: SitterPayoutMethodKind
): boolean {
  if (kind === "bit") return isValidIsraeliMobile(methods.bitPhone);
  if (kind === "paybox") return isValidIsraeliMobile(methods.payboxPhone);
  return Boolean(
    methods.cardHolder.trim() &&
      /^\d{4}$/.test(methods.cardLast4) &&
      methods.cardExpMonth &&
      methods.cardExpYear
  );
}
