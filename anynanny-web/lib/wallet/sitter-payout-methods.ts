import type { SupabaseClient } from "@supabase/supabase-js";
import { brandLabelHe, fetchHypCardToken, inferCardBrand } from "@/lib/billing/hyp/token";
import {
  normalizePayboxPaymentLink,
  parseAuthorizedPayboxPaymentLink,
  validateOptionalPayboxPaymentLink
} from "@/lib/billing/paybox-payment-link";
import { SITTER_PROFILES_TABLE, SITTER_PROFILES_USER_COLUMN } from "@/lib/sitter/sitter-profile";
import { isPostgrestMissingColumnError, isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";

export type SitterPayoutMethodKind = "bit" | "paybox" | "card";

/** Preferred receiving/payout declaration stored on payout_preferred_method. */
export type SitterPreferredPayoutMethod = SitterPayoutMethodKind | "bank" | "cash";

/** Safe parent-facing labels for a sitter's preferred receiving destination. */
export const PREFERRED_RECEIVING_METHOD_LABELS = {
  bit: "Bit",
  paybox: "PayBox",
  bank: "העברה בנקאית",
  cash: "מזומן"
} as const;

export type PreferredReceivingMethodKind = keyof typeof PREFERRED_RECEIVING_METHOD_LABELS;

export function parsePreferredReceivingMethod(
  raw: unknown
): PreferredReceivingMethodKind | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "bit" || value === "paybox" || value === "bank" || value === "cash") {
    return value;
  }
  return null;
}

/** Display-only. Never includes phones, links, or bank account numbers. */
export function preferredReceivingMethodLabel(raw: unknown): string | null {
  const kind = parsePreferredReceivingMethod(raw);
  return kind ? PREFERRED_RECEIVING_METHOD_LABELS[kind] : null;
}

export type SitterPayoutMethods = {
  preferred: SitterPreferredPayoutMethod | null;
  bitPhone: string;
  payboxPhone: string;
  /** Optional private PayBox personal payment HTTPS link. */
  payboxLink: string;
  cardHolder: string;
  cardLast4: string;
  cardExpMonth: number | null;
  cardExpYear: number | null;
  cardIdNumber: string;
  cardBrand: string;
  /** True when a Hyp payout token is registered (token itself never sent to client). */
  hypTokenReady: boolean;
};

export const EMPTY_SITTER_PAYOUT_METHODS: SitterPayoutMethods = {
  preferred: null,
  bitPhone: "",
  payboxPhone: "",
  payboxLink: "",
  cardHolder: "",
  cardLast4: "",
  cardExpMonth: null,
  cardExpYear: null,
  cardIdNumber: "",
  cardBrand: "",
  hypTokenReady: false
};

export const HYP_SITTER_PAYOUT_METHOD_PREFIX = "SitterPayoutMethod_" as const;

/** Direct table SELECT must not request payout_bit_phone / payout_paybox_phone / payout_paybox_link (column privileges). */
const PUBLIC_SELECT_COLS =
  "payout_preferred_method, payout_card_holder, payout_card_last4, payout_card_exp_month, payout_card_exp_year, payout_card_id_number, payout_card_brand, payout_hyp_tokef, payout_hyp_trans_id";

const PUBLIC_SELECT_FALLBACKS = [
  PUBLIC_SELECT_COLS,
  "payout_preferred_method, payout_card_holder, payout_card_last4, payout_card_exp_month, payout_card_exp_year, payout_card_id_number",
  "payout_preferred_method, payout_card_holder, payout_card_last4, payout_card_exp_month, payout_card_exp_year",
  "payout_preferred_method, payout_card_holder, payout_card_last4"
];

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

export function normalizeCardExpYear(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(Number(raw))) return null;
  let year = Math.trunc(Number(raw));
  if (year >= 0 && year < 100) year += 2000;
  return year;
}

export function normalizeIsraeliId(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 9);
}

export function isValidIsraeliId(raw: string): boolean {
  const id = normalizeIsraeliId(raw);
  if (!/^\d{9}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = Number(id[i]) * ((i % 2) + 1);
    if (digit > 9) digit -= 9;
    sum += digit;
  }
  return sum % 10 === 0;
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

/** Empty is allowed (clears the destination). Non-empty must be a valid Israeli mobile. */
export function validateOptionalBitPhone(phone: string): string | null {
  if (!phone.trim()) return null;
  return validateBitPhone(phone);
}

export function validateOptionalPayboxPhone(phone: string): string | null {
  if (!phone.trim()) return null;
  return validatePayboxPhone(phone);
}

export { validateOptionalPayboxPaymentLink };

export function validatePayoutCard(input: {
  holder: string;
  last4OrNumber: string;
  expMonth: number | null;
  expYear: number | null;
  idNumber?: string;
  /** CVV is validated for form completeness only — never persisted. */
  cvv?: string;
  requireCvv?: boolean;
}): string | null {
  if (!input.holder.trim()) return "נא להזין שם בעל הכרטיס.";
  const digits = String(input.last4OrNumber ?? "").replace(/\D/g, "");
  const last4 = extractCardLast4(input.last4OrNumber);
  if (digits.length >= 12 && digits.length <= 19) {
    // Full PAN typed — OK for last4 extract; never store full number.
  } else if (!/^\d{4}$/.test(last4)) {
    return "נא להזין מספר כרטיס מלא (יישמרו 4 ספרות אחרונות בלבד).";
  }
  if (!input.expMonth || input.expMonth < 1 || input.expMonth > 12) return "נא לבחור חודש תוקף.";
  const year = normalizeCardExpYear(input.expYear) ?? 0;
  const nowY = new Date().getFullYear();
  if (year < nowY || year > nowY + 20) return "נא לבחור שנת תוקף תקינה.";
  if (input.idNumber != null && input.idNumber.trim()) {
    if (!isValidIsraeliId(input.idNumber)) return "תעודת זהות אינה תקינה.";
  } else if (input.idNumber !== undefined) {
    return "נא להזין תעודת זהות.";
  }
  if (input.requireCvv) {
    const cvv = String(input.cvv ?? "").replace(/\D/g, "");
    if (!/^\d{3,4}$/.test(cvv)) return "נא להזין CVV תקין (3–4 ספרות).";
  }
  return null;
}

export function buildHypSitterPayoutMethodInfo(sitterId: string): string {
  return `${HYP_SITTER_PAYOUT_METHOD_PREFIX}${sitterId.trim()}`;
}

export function parseHypSitterPayoutMethodSitterId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = String(raw).trim();
  const match = /^sitterpayoutmethod[_:-]?([0-9a-f-]{36})$/i.exec(value);
  if (match?.[1]) return match[1].toLowerCase();
  for (const part of value.split(/[|,;]/)) {
    const nested = parseHypSitterPayoutMethodSitterId(part.trim());
    if (nested) return nested;
  }
  return null;
}

function mapRow(row: Record<string, unknown> | null): SitterPayoutMethods {
  if (!row) return { ...EMPTY_SITTER_PAYOUT_METHODS };
  const preferredRaw = String(row.payout_preferred_method ?? "").trim();
  const preferred =
    preferredRaw === "bit" ||
    preferredRaw === "paybox" ||
    preferredRaw === "card" ||
    preferredRaw === "bank" ||
    preferredRaw === "cash"
      ? preferredRaw
      : null;
  const tokenReady = Boolean(
    String(row.payout_hyp_tokef ?? "").trim() ||
      String(row.payout_hyp_trans_id ?? "").trim() ||
      String(row.payout_hyp_token ?? "").trim()
  );
  return {
    preferred,
    bitPhone: String(row.payout_bit_phone ?? ""),
    payboxPhone: String(row.payout_paybox_phone ?? ""),
    payboxLink: parseAuthorizedPayboxPaymentLink(String(row.payout_paybox_link ?? "")) ?? "",
    cardHolder: String(row.payout_card_holder ?? ""),
    cardLast4: String(row.payout_card_last4 ?? ""),
    cardExpMonth:
      row.payout_card_exp_month != null && Number.isFinite(Number(row.payout_card_exp_month))
        ? Number(row.payout_card_exp_month)
        : null,
    cardExpYear: normalizeCardExpYear(
      row.payout_card_exp_year != null ? Number(row.payout_card_exp_year) : null
    ),
    cardIdNumber: String(row.payout_card_id_number ?? ""),
    cardBrand: String(row.payout_card_brand ?? ""),
    hypTokenReady: tokenReady
  };
}

function isMissingSchema(message: string | undefined): boolean {
  const msg = message ?? "";
  return (
    isPostgrestSchemaDriftError(msg) ||
    isPostgrestMissingColumnError(msg, "payout_bit_phone") ||
    isPostgrestMissingColumnError(msg, "payout_paybox_phone") ||
    isPostgrestMissingColumnError(msg, "payout_paybox_link") ||
    isPostgrestMissingColumnError(msg, "payout_card_last4") ||
    isPostgrestMissingColumnError(msg, "payout_card_id_number") ||
    isPostgrestMissingColumnError(msg, "payout_hyp_token") ||
    /Could not find the table/i.test(msg) ||
    /PGRST205/i.test(msg)
  );
}

async function loadOwnManualPayoutPhones(
  supabase: SupabaseClient,
  sitterId: string
): Promise<{ bitPhone: string; payboxPhone: string; payboxLink: string }> {
  const empty = { bitPhone: "", payboxPhone: "", payboxLink: "" };
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user || user.id !== sitterId) {
    return empty;
  }

  const rpc = await supabase.rpc("sitter_own_manual_payout_destinations");
  if (!rpc.error) {
    const payload = (rpc.data ?? {}) as {
      bit_phone?: string | null;
      paybox_phone?: string | null;
      paybox_link?: string | null;
    };
    return {
      bitPhone: String(payload.bit_phone ?? ""),
      payboxPhone: String(payload.paybox_phone ?? ""),
      payboxLink: String(payload.paybox_link ?? "")
    };
  }

  const rpcMsg = String(rpc.error.message ?? "");
  if (!/sitter_own_manual_payout_destinations|could not find the function|PGRST202/i.test(rpcMsg)) {
    return empty;
  }

  const fallback = await supabase
    .from(SITTER_PROFILES_TABLE)
    .select("payout_bit_phone, payout_paybox_phone, payout_paybox_link")
    .eq(SITTER_PROFILES_USER_COLUMN, sitterId)
    .maybeSingle();
  if (fallback.error) return empty;
  const row = fallback.data as {
    payout_bit_phone?: string | null;
    payout_paybox_phone?: string | null;
    payout_paybox_link?: string | null;
  } | null;
  return {
    bitPhone: String(row?.payout_bit_phone ?? ""),
    payboxPhone: String(row?.payout_paybox_phone ?? ""),
    payboxLink: String(row?.payout_paybox_link ?? "")
  };
}

async function selectPayoutRow(
  supabase: SupabaseClient,
  sitterId: string
): Promise<{ row: Record<string, unknown> | null; error: string | null; missingSchema: boolean }> {
  let row: Record<string, unknown> | null = null;
  let tableSelectOk = false;
  for (const cols of PUBLIC_SELECT_FALLBACKS) {
    const { data, error } = await supabase
      .from(SITTER_PROFILES_TABLE)
      .select(cols)
      .eq(SITTER_PROFILES_USER_COLUMN, sitterId)
      .maybeSingle();

    if (!error) {
      row = (data as Record<string, unknown> | null) ?? null;
      tableSelectOk = true;
      break;
    }

    if (isMissingSchema(error.message)) {
      continue;
    }
    return { row: null, error: error.message, missingSchema: false };
  }

  const phones = await loadOwnManualPayoutPhones(supabase, sitterId);
  const merged: Record<string, unknown> = {
    ...(row ?? {}),
    payout_bit_phone: phones.bitPhone || null,
    payout_paybox_phone: phones.payboxPhone || null,
    payout_paybox_link: phones.payboxLink || null
  };

  return { row: merged, error: null, missingSchema: !tableSelectOk };
}

export async function fetchSitterPayoutMethods(
  supabase: SupabaseClient,
  sitterId: string
): Promise<{ methods: SitterPayoutMethods; error: string | null; missingSchema: boolean }> {
  const result = await selectPayoutRow(supabase, sitterId);
  if (result.error) {
    return {
      methods: { ...EMPTY_SITTER_PAYOUT_METHODS },
      error: result.error,
      missingSchema: result.missingSchema
    };
  }
  return {
    methods: mapRow(result.row),
    error: null,
    missingSchema: result.missingSchema
  };
}

export type SitterPayoutSavePatch = Partial<SitterPayoutMethods> & {
  preferred?: SitterPreferredPayoutMethod | null;
  /** Server-only Hyp fields — never accept from browser for arbitrary overwrite without complete flow. */
  hypToken?: string | null;
  hypTokef?: string | null;
  hypTransId?: string | null;
};

function buildUpdatePayload(patch: SitterPayoutSavePatch): Record<string, unknown> {
  const row: Record<string, unknown> = {
    payout_methods_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (patch.preferred !== undefined) {
    row.payout_preferred_method = patch.preferred || null;
  }
  if (patch.bitPhone !== undefined) {
    row.payout_bit_phone = normalizePhone(patch.bitPhone) || null;
  }
  if (patch.payboxPhone !== undefined) {
    row.payout_paybox_phone = normalizePhone(patch.payboxPhone) || null;
  }
  if (patch.payboxLink !== undefined) {
    const normalized = normalizePayboxPaymentLink(patch.payboxLink);
    row.payout_paybox_link = parseAuthorizedPayboxPaymentLink(normalized) || null;
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
    row.payout_card_exp_year = normalizeCardExpYear(patch.cardExpYear);
  }
  if (patch.cardIdNumber !== undefined) {
    row.payout_card_id_number = normalizeIsraeliId(patch.cardIdNumber) || null;
  }
  if (patch.cardBrand !== undefined) {
    row.payout_card_brand = patch.cardBrand.trim() || null;
  }
  if (patch.hypToken !== undefined) {
    row.payout_hyp_token = patch.hypToken?.trim() || null;
  }
  if (patch.hypTokef !== undefined) {
    row.payout_hyp_tokef = patch.hypTokef?.trim() || null;
  }
  if (patch.hypTransId !== undefined) {
    row.payout_hyp_trans_id = patch.hypTransId?.trim() || null;
  }

  return row;
}

async function updateWithColumnFallback(
  supabase: SupabaseClient,
  sitterId: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null; missingSchema: boolean }> {
  let current = { ...payload };
  for (let attempt = 0; attempt < 8; attempt++) {
    const { error } = await supabase
      .from(SITTER_PROFILES_TABLE)
      .update(current)
      .eq(SITTER_PROFILES_USER_COLUMN, sitterId);

    if (!error) return { error: null, missingSchema: false };

    const msg = error.message ?? "";
    const missingCol =
      /Could not find the '([^']+)' column/i.exec(msg)?.[1] ??
      /column ["']?([a-z0-9_]+)["']? of relation/i.exec(msg)?.[1] ??
      null;

    if (missingCol && missingCol in current) {
      delete current[missingCol];
      continue;
    }

    if (isMissingSchema(msg)) {
      return { error: msg, missingSchema: true };
    }

    return { error: msg, missingSchema: false };
  }

  return { error: "שמירת אמצעי המשיכה נכשלה לאחר ניסיונות חוזרים.", missingSchema: false };
}

export async function saveSitterPayoutMethods(
  supabase: SupabaseClient,
  sitterId: string,
  patch: SitterPayoutSavePatch
): Promise<{ ok: true; methods: SitterPayoutMethods } | { ok: false; error: string; missingSchema?: boolean }> {
  const payload = buildUpdatePayload(patch);
  const updated = await updateWithColumnFallback(supabase, sitterId, payload);
  if (updated.error) {
    return { ok: false, error: updated.error, missingSchema: updated.missingSchema };
  }

  const loaded = await fetchSitterPayoutMethods(supabase, sitterId);
  if (loaded.error && !loaded.missingSchema) {
    // Update succeeded but re-read failed — still treat as ok with mapped empty+patch.
    return {
      ok: true,
      methods: {
        ...EMPTY_SITTER_PAYOUT_METHODS,
        ...patch,
        cardLast4: patch.cardLast4 ? extractCardLast4(patch.cardLast4) : "",
        cardExpYear: normalizeCardExpYear(patch.cardExpYear ?? null),
        cardIdNumber: patch.cardIdNumber ? normalizeIsraeliId(patch.cardIdNumber) : "",
        hypTokenReady: Boolean(patch.hypToken)
      }
    };
  }

  return { ok: true, methods: loaded.methods };
}

/** After Hyp success: getToken + persist payout card token on sitter_profiles. */
export async function saveHypSitterPayoutFromTransId(
  supabase: SupabaseClient,
  input: {
    sitterId: string;
    transId: string;
    israeliId?: string | null;
    brandHint?: string | null;
    holderHint?: string | null;
  }
): Promise<{ methods: SitterPayoutMethods | null; error: string | null }> {
  try {
    const token = await fetchHypCardToken({ transId: input.transId });
    const last4 = token.last4 || token.token.slice(-4);
    const brand = inferCardBrand(last4, input.brandHint);
    const result = await saveSitterPayoutMethods(supabase, input.sitterId, {
      preferred: "card",
      cardLast4: last4,
      cardExpMonth: token.expMonth,
      cardExpYear: token.expYear,
      cardBrand: brandLabelHe(brand),
      cardHolder: input.holderHint?.trim() || undefined,
      cardIdNumber: input.israeliId ? normalizeIsraeliId(input.israeliId) : undefined,
      hypToken: token.token,
      hypTokef: token.tokef,
      hypTransId: input.transId
    });

    if (!result.ok) return { methods: null, error: result.error };
    return { methods: result.methods, error: null };
  } catch (error) {
    return {
      methods: null,
      error: error instanceof Error ? error.message : "שמירת טוקן HYP נכשלה."
    };
  }
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

/** Parent-visible PayBox: phone fallback and/or a valid personal payment link. */
export function payboxManualReceivingConfigured(methods: SitterPayoutMethods): boolean {
  return (
    isValidIsraeliMobile(methods.payboxPhone) ||
    Boolean(parseAuthorizedPayboxPaymentLink(methods.payboxLink))
  );
}
