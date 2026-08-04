/** Canonical Israeli banks with Masav clearing codes for payout forms. */

export type IsraelBankEntry = {
  /** Masav bank code, typically 2 digits (zero-padded). */
  code: string;
  name: string;
};

export const ISRAEL_BANKS: readonly IsraelBankEntry[] = [
  { code: "12", name: "בנק הפועלים" },
  { code: "10", name: "בנק לאומי" },
  { code: "11", name: "בנק דיסקונט" },
  { code: "20", name: "בנק מזרחי טפחות" },
  { code: "31", name: "בנק הבינלאומי" },
  { code: "17", name: "בנק מרכנתיל" },
  { code: "54", name: "בנק ירושלים" },
  { code: "04", name: "בנק יהב" },
  { code: "09", name: "בנק הדואר" },
  { code: "18", name: "One Zero" },
  { code: "10", name: "Pepper" }
] as const;

export type IsraelBankName = (typeof ISRAEL_BANKS)[number]["name"];

/** Normalize typed bank codes to a comparable Masav form (e.g. "4" → "04"). */
export function normalizeBankCode(raw: string | null | undefined): string {
  if (raw == null) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 1) return `0${digits}`;
  return digits.slice(0, 3);
}

export function findIsraelBankByName(name: string | null | undefined): IsraelBankEntry | null {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return null;
  return ISRAEL_BANKS.find((b) => b.name === trimmed) ?? null;
}

export function findIsraelBankByCode(code: string | null | undefined): IsraelBankEntry | null {
  const normalized = normalizeBankCode(code);
  if (!normalized) return null;
  // Prefer the first canonical match (e.g. code 10 → לאומי before Pepper).
  return ISRAEL_BANKS.find((b) => b.code === normalized) ?? null;
}

/** Unique bank codes for a code dropdown, preserving list order. */
export function israelBankCodeOptions(currentCode?: string | null): string[] {
  const seen = new Set<string>();
  const codes: string[] = [];
  for (const bank of ISRAEL_BANKS) {
    if (seen.has(bank.code)) continue;
    seen.add(bank.code);
    codes.push(bank.code);
  }
  const current = normalizeBankCode(currentCode);
  if (current && !seen.has(current)) {
    return [current, ...codes];
  }
  return codes;
}

/** Bank names for a name dropdown, including a legacy saved name if needed. */
export function israelBankNameOptions(currentName?: string | null): string[] {
  const names = ISRAEL_BANKS.map((b) => b.name);
  const current = typeof currentName === "string" ? currentName.trim() : "";
  if (current && !names.includes(current)) {
    return [current, ...names];
  }
  return names;
}

/** Keep legacy export name used by older imports. */
export const israelBankSelectOptions = israelBankNameOptions;

export function syncBankFieldsFromName(name: string): { bank_code: string; bank_name: string } {
  const trimmed = name.trim();
  const match = findIsraelBankByName(trimmed);
  return {
    bank_name: trimmed,
    bank_code: match?.code ?? ""
  };
}

export function syncBankFieldsFromCode(code: string): { bank_code: string; bank_name: string } {
  const normalized = normalizeBankCode(code);
  const match = findIsraelBankByCode(normalized);
  return {
    bank_code: normalized,
    bank_name: match?.name ?? ""
  };
}
