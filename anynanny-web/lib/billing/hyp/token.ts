import { getHypCredentials } from "@/lib/billing/hyp/create-transaction";

const PAY_HOST = "https://pay.hyp.co.il/p/";
const HYP_FETCH_TIMEOUT_MS = 20_000;

function parseQueryBody(body: string): Record<string, string> {
  const text = body.trim().replace(/^\?/, "");
  const out: Record<string, string> = {};
  if (!text) return out;
  for (const part of text.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const key = decodeURIComponent((eq >= 0 ? part.slice(0, eq) : part).replace(/\+/g, " "));
    const value = decodeURIComponent((eq >= 0 ? part.slice(eq + 1) : "").replace(/\+/g, " "));
    if (key) out[key] = value;
  }
  return out;
}

function pick(params: Record<string, string>, ...keys: string[]): string | null {
  for (const key of keys) {
    const direct = params[key] ?? params[key.toLowerCase()] ?? params[key.toUpperCase()];
    if (direct != null && String(direct).trim()) return String(direct).trim();
  }
  return null;
}

/** Tokef from Hyp is typically YYMM (e.g. 3105 → May 2031) or sometimes MMYY. */
export function parseHypTokef(tokef: string | null | undefined): { expMonth: number; expYear: number } | null {
  const digits = String(tokef ?? "").replace(/\D/g, "");
  if (digits.length !== 4) return null;

  const a = Number(digits.slice(0, 2));
  const b = Number(digits.slice(2, 4));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  // Prefer YYMM when first pair looks like a year (00–99) and second is a month.
  if (b >= 1 && b <= 12) {
    return { expMonth: b, expYear: 2000 + a };
  }
  // Fallback MMYY
  if (a >= 1 && a <= 12) {
    return { expMonth: a, expYear: 2000 + b };
  }
  return null;
}

export function inferCardBrand(last4: string, hint?: string | null): string {
  const h = String(hint ?? "").trim().toLowerCase();
  if (h.includes("visa")) return "visa";
  if (h.includes("master") || h.includes("mc")) return "mastercard";
  if (h.includes("isra") || h.includes("cal")) return "isracard";
  if (h.includes("amex") || h.includes("american")) return "amex";
  if (h.includes("apple")) return "apple_pay";
  if (h.includes("google")) return "google_pay";
  if (last4) return "card";
  return "card";
}

export function brandLabelHe(brand: string): string {
  switch (brand) {
    case "visa":
      return "Visa";
    case "mastercard":
      return "Mastercard";
    case "isracard":
      return "Isracard";
    case "amex":
      return "American Express";
    case "apple_pay":
      return "Apple Pay";
    case "google_pay":
      return "Google Pay";
    default:
      return "כרטיס אשראי";
  }
}

export type HypTokenResult = {
  token: string;
  tokef: string;
  expMonth: number;
  expYear: number;
  last4: string;
  transId: string;
};

/**
 * Fetch Hyp card token for a completed (or verified) transaction Id.
 * Docs: action=getToken&Masof&PassP&TransId[&allowFalse=True]
 */
export async function fetchHypCardToken(params: {
  transId: string;
  allowFalse?: boolean;
}): Promise<HypTokenResult> {
  const transId = String(params.transId ?? "").trim();
  if (!transId) throw new Error("Missing Hyp transaction Id for getToken.");

  const creds = getHypCredentials();
  const query = new URLSearchParams({
    action: "getToken",
    Masof: creds.masof,
    PassP: creds.passP,
    TransId: transId
  });
  if (params.allowFalse !== false) {
    query.set("allowFalse", "True");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HYP_FETCH_TIMEOUT_MS);
  let body = "";
  try {
    const response = await fetch(`${creds.payBaseUrl || PAY_HOST}?${query.toString()}`, {
      method: "GET",
      headers: { Accept: "text/plain,*/*" },
      signal: controller.signal,
      cache: "no-store"
    });
    body = await response.text();
    if (!response.ok) {
      throw new Error(`Hyp getToken HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }

  const parsed = parseQueryBody(body);
  const cCode = pick(parsed, "CCode", "ccode");
  if (cCode && cCode !== "0" && cCode !== "00") {
    throw new Error(`Hyp getToken failed (CCode=${cCode}). Terminal may lack tokenization permission.`);
  }

  const token = pick(parsed, "Token", "token", "CC");
  const tokef = pick(parsed, "Tokef", "tokef");
  if (!token || token.length < 12) {
    throw new Error("Hyp getToken response missing Token.");
  }
  const exp = parseHypTokef(tokef);
  if (!exp) {
    throw new Error("Hyp getToken response missing/invalid Tokef.");
  }

  return {
    token,
    tokef: tokef!,
    expMonth: exp.expMonth,
    expYear: exp.expYear,
    last4: token.slice(-4),
    transId: pick(parsed, "Id", "id") || transId
  };
}

export type HypSoftChargeInput = {
  amountNis: number;
  token: string;
  expMonth: number;
  expYear: number;
  info: string;
  moreData?: string | null;
  userId?: string | null;
  clientName?: string | null;
  description?: string | null;
};

export type HypSoftChargeResult = {
  success: boolean;
  cCode: string | null;
  approvalId: string | null;
  amount: string | null;
  raw: Record<string, string>;
  error?: string;
};

/**
 * Charge a saved Hyp token server-to-server (merchant-managed recurring / saved card).
 * Docs: action=soft&CC=<token>&Tmonth&Tyear&Token=True
 */
export async function chargeHypSavedToken(input: HypSoftChargeInput): Promise<HypSoftChargeResult> {
  const creds = getHypCredentials();
  const amount = Math.max(0.5, Number(input.amountNis) || 0);
  const amountStr = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  const yy = String(input.expYear % 100).padStart(2, "0");
  const mm = String(input.expMonth).padStart(2, "0");

  const query = new URLSearchParams({
    action: "soft",
    Masof: creds.masof,
    PassP: creds.passP,
    Amount: amountStr,
    Coin: "1",
    CC: input.token,
    Tmonth: mm,
    Tyear: yy,
    Token: "True",
    Info: input.info,
    UTF8: "True",
    UTF8out: "True",
    UserId: (input.userId?.trim() || "000000000").slice(0, 20),
    ClientName: (input.clientName?.trim() || "Parent").slice(0, 50)
  });
  if (input.moreData?.trim()) query.set("MoreData", input.moreData.trim());
  if (input.description?.trim()) query.set("Fild1", input.description.trim().slice(0, 100));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HYP_FETCH_TIMEOUT_MS);
  let body = "";
  try {
    const response = await fetch(`${creds.payBaseUrl || PAY_HOST}?${query.toString()}`, {
      method: "GET",
      headers: { Accept: "text/plain,*/*" },
      signal: controller.signal,
      cache: "no-store"
    });
    body = await response.text();
    if (!response.ok) {
      return {
        success: false,
        cCode: null,
        approvalId: null,
        amount: null,
        raw: {},
        error: `Hyp soft charge HTTP ${response.status}`
      };
    }
  } finally {
    clearTimeout(timeoutId);
  }

  const raw = parseQueryBody(body);
  const cCode = pick(raw, "CCode", "ccode");
  const ok = cCode == null || cCode === "" || cCode === "0" || cCode === "00";

  return {
    success: ok,
    cCode,
    approvalId: pick(raw, "Id", "id", "ACode"),
    amount: pick(raw, "Amount", "amount"),
    raw,
    error: ok ? undefined : `Hyp soft charge failed (CCode=${cCode ?? "?"})`
  };
}
