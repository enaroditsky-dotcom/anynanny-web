export const BROADCAST_SELECTED_PUBLIC_ID_MAX = 50;
export const SELECTED_BROADCAST_AUDIENCE = "selected_public_ids" as const;
export const SELECTED_RECIPIENTS_REJECTED_MESSAGE = "רשימת הנמענים אינה תקינה. השליחה בוטלה.";

export function isSelectedRecipientsRejected(error: unknown): boolean {
  return error instanceof Error && error.message === SELECTED_RECIPIENTS_REJECTED_MESSAGE;
}
export const SELECTED_PUBLIC_IDS_WRONG_AUDIENCE_MESSAGE = "רשימת מזהים אינה שייכת לקהל הזה.";

const PUBLIC_ID = /^(RP|P|RAN|AN|CONS)-\d+$/i;
const UUID_TEXT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SELECTED_PUBLIC_ID_REASON_LABELS: Record<string, string> = {
  invalid: "פורמט לא תקין",
  duplicate: "כפול",
  unknown: "לא נמצא",
  ambiguous: "זיהוי לא חד-משמעי",
  inactive: "החשבון אינו פעיל",
  role_mismatch: "התפקיד אינו תואם למזהה",
  empty: "אין נמענים",
  too_many: "יותר מ-50 מזהים"
};

export type SelectedPublicIdEntry = {
  publicId: string;
  role: "parent" | "sitter" | null;
  ok: boolean;
  reason: string | null;
};

export type SelectedPublicIdPreview = {
  ok: boolean;
  recipientCount: number;
  error: string | null;
  entries: SelectedPublicIdEntry[];
};

export function selectedPublicIdReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return SELECTED_PUBLIC_ID_REASON_LABELS[reason] ?? "לא תקין";
}

export function suppliedPublicIds(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (!Array.isArray(value)) return false;
  return value.some((item) => String(item ?? "").trim().length > 0);
}

function tokenize(value: unknown): string[] | null {
  if (typeof value === "string") {
    return value
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(value)) return null;
  const tokens: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    tokens.push(
      ...item
        .split(/[\s,]+/)
        .map((part) => part.trim())
        .filter(Boolean)
    );
  }
  return tokens;
}

function canonicalPublicId(token: string): string {
  const match = token.trim().toUpperCase().match(/^(RP|P|RAN|AN|CONS)-(\d+)$/);
  if (!match) return token.trim().toUpperCase();
  return `${match[1]}-${match[2]}`;
}

export function parseSelectedPublicIdList(
  value: unknown
): { ok: true; ids: string[] } | { ok: false; error: string } {
  const tokens = tokenize(value);
  if (!tokens) return { ok: false, error: "יש להזין מזהים ציבוריים." };
  if (tokens.length === 0) return { ok: false, error: "יש להזין לפחות מזהה ציבורי אחד." };
  if (tokens.length > BROADCAST_SELECTED_PUBLIC_ID_MAX) {
    return { ok: false, error: "ניתן לבחור עד 50 מזהים." };
  }

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const token of tokens) {
    if (UUID_TEXT.test(token) || /^\d+$/.test(token) || !PUBLIC_ID.test(token)) {
      return { ok: false, error: "כל מזהה חייב להיות RP-, P-, RAN-, AN- או CONS- מלא." };
    }
    const canonical = canonicalPublicId(token);
    if (seen.has(canonical)) {
      return { ok: false, error: `המזהה ${canonical} מופיע יותר מפעם אחת.` };
    }
    seen.add(canonical);
    ids.push(canonical);
  }
  return { ok: true, ids };
}

export function mergeSelectedPublicIds(
  existing: readonly string[],
  draft: string
): { ok: true; ids: string[] } | { ok: false; error: string } {
  const incoming = tokenize(draft);
  if (!incoming || incoming.length === 0) {
    return { ok: false, error: "יש להזין לפחות מזהה ציבורי אחד." };
  }
  return parseSelectedPublicIdList([...existing, ...incoming]);
}

export function requireSelectedPublicIds(
  audience: string,
  raw: unknown
): { ok: true; ids: string[] | null } | { ok: false; error: string } {
  if (audience === SELECTED_BROADCAST_AUDIENCE) {
    const parsed = parseSelectedPublicIdList(raw);
    if (!parsed.ok) return parsed;
    return { ok: true, ids: parsed.ids };
  }
  if (suppliedPublicIds(raw)) {
    return { ok: false, error: SELECTED_PUBLIC_IDS_WRONG_AUDIENCE_MESSAGE };
  }
  return { ok: true, ids: null };
}

export function readSelectedRecipientPreview(data: unknown): SelectedPublicIdPreview {
  let row: Record<string, unknown> | null = null;
  if (typeof data === "string") {
    try {
      row = JSON.parse(data) as Record<string, unknown>;
    } catch {
      row = null;
    }
  } else if (data && typeof data === "object") {
    row = data as Record<string, unknown>;
  }
  const rawEntries = Array.isArray(row?.entries) ? row.entries : [];
  const entries: SelectedPublicIdEntry[] = rawEntries.map((item) => {
    const entry = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const role = entry.role === "parent" || entry.role === "sitter" ? entry.role : null;
    return {
      publicId: String(entry.public_id ?? "").trim(),
      role,
      ok: entry.ok === true,
      reason: typeof entry.reason === "string" ? entry.reason : null
    };
  });
  const recipientCount = Number(row?.recipient_count);
  return {
    ok: row?.ok === true,
    recipientCount: Number.isFinite(recipientCount) ? Math.max(0, Math.floor(recipientCount)) : 0,
    error: typeof row?.error === "string" ? row.error : null,
    entries
  };
}
