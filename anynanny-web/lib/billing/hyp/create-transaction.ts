/**
 * Hyp Pay APISign integration (official Pay Page API).
 *
 * Spec: https://developers.hyp.co.il/pay/getting-started/creating-a-payment-page
 *
 * Wire auth fields (only these are valid for APISign):
 *   Masof = terminal id
 *   KEY   = API key / password signature
 *   PassP = API password
 *
 * Dashboard "User" (gARkb) is console identity — it is NOT an APISign parameter.
 * Sending SuccessUrl/ErrorUrl for an unregistered origin returns CCode=902
 * ("request origin does not match terminal settings").
 *
 * Configure success/fail URLs in the Hyp terminal dashboard to:
 *   {APP_ORIGIN}/parent/checkout/complete?checkout=success
 */

export type HypCredentials = {
  /** Terminal ID → Masof */
  masof: string;
  /** Dashboard console user (stored for ops; not sent on APISign by default) */
  user: string;
  /** API key / password signature → KEY */
  key: string;
  /** API password → PassP */
  passP: string;
  payBaseUrl: string;
};

export type HypCreateTransactionInput = {
  amountNis: number;
  bookingId: string;
  /** Double-Shake session id — echoed back as MoreData on Hyp return/IPN. */
  shiftSessionId?: string | null;
  description?: string;
  paymentMethod?: string;
  pageLang?: "HEB" | "ENG";
  /**
   * Only sent when HYP_ALLOW_DYNAMIC_RETURN_URLS=true AND the domain is
   * whitelisted on the Hyp terminal. Otherwise omit (configure in dashboard).
   */
  successUrl?: string | null;
  cancelUrl?: string | null;
};

export type HypCreateTransactionResult = {
  checkoutUrl: string;
  sessionId: string;
  signedQuery: string;
  order: string;
};

const PAY_HOST = "https://pay.hyp.co.il/p/";
const HYP_FETCH_TIMEOUT_MS = 20_000;

/** Exact dedicated API credentials from the Hyp terminal dashboard. */
export const HYP_DASHBOARD_API_CREDENTIALS = {
  masof: "0086229230",
  user: "gARkb",
  passP: "hyp1234",
  key: "2d09e1542a8955f3b582777ff6e31aecb14da51b"
} as const;

const CONSOLE_LOGIN_PASSWORD = "lqkPWCS3";

function envFlag(name: string): boolean {
  const v = String(process.env[name] ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function trimEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function resolvePayBaseUrl(): string {
  const raw = trimEnv("HYP_PAY_BASE_URL") || trimEnv("HYP_API_URL") || PAY_HOST;
  if (/sandbox\.hyp\.co\.il\/api/i.test(raw) || /\/api\/v1\/payment/i.test(raw)) {
    return PAY_HOST;
  }
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (!url.pathname || url.pathname === "/") url.pathname = "/p/";
    url.search = "";
    url.hash = "";
    const href = url.toString();
    return href.endsWith("/") ? href : `${href}/`;
  } catch {
    return PAY_HOST;
  }
}

/**
 * Credentials for APISign. Always uses dedicated dashboard API values
 * (never the console login password).
 */
export function getHypCredentials(): HypCredentials {
  // Hard preference for the known-good dashboard API values so a bad/stale
  // process env cannot swap in the console login password.
  const masof = HYP_DASHBOARD_API_CREDENTIALS.masof;
  const user = HYP_DASHBOARD_API_CREDENTIALS.user;
  const key = HYP_DASHBOARD_API_CREDENTIALS.key;
  const passP = HYP_DASHBOARD_API_CREDENTIALS.passP;

  // Allow env override only when values are clearly the dedicated API fields.
  const envMasof = trimEnv("HYP_MASOF") || trimEnv("HYP_TERMINAL_ID");
  const envKey = trimEnv("HYP_API_KEY") || trimEnv("HYP_KEY");
  const envPassP = trimEnv("HYP_PASSP"); // never HYP_PASS
  const envUser = trimEnv("HYP_USER") || trimEnv("HYP_USERNAME");

  const resolved: HypCredentials = {
    masof: envMasof || masof,
    user: envUser || user,
    key: envKey || key,
    passP: envPassP || passP,
    payBaseUrl: resolvePayBaseUrl()
  };

  if (resolved.passP === CONSOLE_LOGIN_PASSWORD || resolved.key === CONSOLE_LOGIN_PASSWORD) {
    throw new Error(
      "Hyp PassP/KEY must be the dedicated API credentials, not the console login password."
    );
  }
  if (resolved.key.length < 32) {
    throw new Error("Hyp KEY must be the full API Key / Password Signature from the dashboard.");
  }
  if (!resolved.masof || !resolved.key || !resolved.passP) {
    throw new Error("Hyp credentials incomplete (Masof, KEY, PassP required).");
  }

  return resolved;
}

export function isHypConfigured(): boolean {
  try {
    const c = getHypCredentials();
    return Boolean(c.masof && c.key && c.passP);
  } catch {
    return false;
  }
}

function formatHypAmount(amountNis: number): string {
  const n = Math.max(0.5, Number(amountNis) || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function hypOrderFromBookingId(bookingId: string): string {
  // Hyp Order is often capped (~20). Full booking UUID lives in Info instead.
  const compact = bookingId.replace(/[^a-zA-Z0-9]/g, "");
  return compact.slice(0, 20) || `ord${Date.now()}`.slice(0, 20);
}

/** Hyp expects capitalized True/False (not lowercase boolean strings). */
function hypTrueFalse(value: boolean): "True" | "False" {
  return value ? "True" : "False";
}

/**
 * Build an application/x-www-form-urlencoded body in stable insertion order.
 * Uses encodeURIComponent (RFC3988) which Hyp accepts for APISign.
 */
function encodeHypForm(entries: Array<[string, string]>): string {
  return entries
    .filter(([, v]) => v !== undefined && v !== null && String(v).length > 0)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

function readCCode(body: string): string | null {
  const match = body.match(/(?:^|&)CCode=([^&]*)/i);
  return match ? decodeURIComponent(match[1] ?? "").trim() : null;
}

function isHypSignSuccessBody(body: string): boolean {
  const text = body.trim().replace(/^\?/, "");
  if (!text) return false;
  const ccode = readCCode(text);
  if (ccode != null && ccode !== "" && ccode !== "0") return false;
  if (/^error[=:]/i.test(text)) return false;
  return /(?:^|&)signature=/i.test(text) || /(?:^|&)action=pay(?:&|$)/i.test(text);
}

function authFailureMessage(body: string): string {
  const ccode = readCCode(body);
  if (ccode === "902") {
    return (
      "Hyp authentication failed (CCode=902): request origin does not match terminal settings. " +
      "Do not send SuccessUrl/ErrorUrl unless that domain is whitelisted on the Hyp terminal. " +
      "Configure return URLs in the Hyp dashboard, and verify Masof/KEY/PassP."
    );
  }
  if (ccode) {
    return `Hyp APISign rejected the request (CCode=${ccode}): ${body.slice(0, 160)}`;
  }
  return body
    ? `Hyp APISign rejected the request: ${body.slice(0, 180)}`
    : "Hyp APISign returned an empty response.";
}

/** Strip KEY/PassP while preserving original parameter order (required for pay URL). */
export function stripSecretsPreserveOrder(signedQuery: string): string {
  return signedQuery
    .replace(/^\?/, "")
    .split("&")
    .filter((part) => {
      const key = decodeURIComponent((part.split("=")[0] ?? "").replace(/\+/g, " "));
      return key !== "KEY" && key !== "PassP" && key !== "Key" && key !== "Passp";
    })
    .join("&");
}

/**
 * Official APISign payload:
 * action=APISign&What=SIGN&Sign=True&Masof&KEY&PassP&Amount&...
 */
export function buildHypApiSignEntries(
  creds: HypCredentials,
  input: HypCreateTransactionInput,
  order: string
): Array<[string, string]> {
  const amount = formatHypAmount(input.amountNis);
  const allowDynamicReturns = envFlag("HYP_ALLOW_DYNAMIC_RETURN_URLS");
  const includeUser = envFlag("HYP_INCLUDE_USER_IN_APISIGN");

  const entries: Array<[string, string]> = [
    // Exact order from Hyp docs examples.
    ["action", "APISign"],
    ["What", "SIGN"],
    ["Sign", hypTrueFalse(true)],
    ["Masof", creds.masof],
    ["KEY", creds.key],
    ["PassP", creds.passP]
  ];

  // Dashboard User is NOT part of official APISign. Opt-in only.
  if (includeUser && creds.user) {
    entries.push(["User", creds.user]);
  }

  entries.push(
    ["Amount", amount],
    ["Coin", "1"],
    ["Order", order],
    // Full booking UUID — returned on success redirect / IPN as Info.
    ["Info", input.bookingId],
    ["PageLang", input.pageLang ?? "HEB"],
    ["UTF8", hypTrueFalse(true)],
    ["UTF8out", hypTrueFalse(true)],
    ["Tash", "1"]
  );

  const shiftSessionId = input.shiftSessionId?.trim();
  if (shiftSessionId) {
    // Echoed on return so /api/hyp/complete can mark the correct sessions row paid.
    entries.push(["MoreData", `Session_${shiftSessionId}`]);
  }

  if (input.description?.trim()) {
    entries.push(["Fild1", input.description.trim().slice(0, 100)]);
  }

  if (allowDynamicReturns) {
    if (input.successUrl?.trim()) entries.push(["SuccessUrl", input.successUrl.trim()]);
    if (input.cancelUrl?.trim()) {
      entries.push(["ErrorUrl", input.cancelUrl.trim()]);
      entries.push(["CancelUrl", input.cancelUrl.trim()]);
    }
  }

  return entries;
}

async function requestApiSign(
  payBaseUrl: string,
  formBody: string,
  method: "GET" | "POST",
  signal: AbortSignal
): Promise<string> {
  if (method === "POST") {
    const response = await fetch(payBaseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/plain,*/*"
      },
      body: formBody,
      redirect: "follow",
      signal,
      cache: "no-store"
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Hyp APISign HTTP ${response.status}`);
    }
    return text;
  }

  const response = await fetch(`${payBaseUrl}?${formBody}`, {
    method: "GET",
    headers: { Accept: "text/plain,*/*" },
    redirect: "follow",
    signal,
    cache: "no-store"
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Hyp APISign HTTP ${response.status}`);
  }
  return text;
}

/**
 * Create Hyp hosted checkout URL via APISign → pay.
 */
export async function createHypTransaction(
  input: HypCreateTransactionInput
): Promise<HypCreateTransactionResult> {
  const creds = getHypCredentials();
  const order = hypOrderFromBookingId(input.bookingId);
  const entries = buildHypApiSignEntries(creds, input, order);
  const formBody = encodeHypForm(entries);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HYP_FETCH_TIMEOUT_MS);

  try {
    // Official docs use GET; many production integrations use POST. Try GET first.
    let raw = "";
    let lastError: unknown = null;

    for (const method of ["GET", "POST"] as const) {
      try {
        raw = await requestApiSign(creds.payBaseUrl, formBody, method, controller.signal);
        if (isHypSignSuccessBody(raw)) break;
        lastError = new Error(authFailureMessage(raw.trim()));
      } catch (error) {
        lastError = error;
      }
    }

    const signedQuery = raw.trim().replace(/^\?/, "");
    if (!isHypSignSuccessBody(signedQuery)) {
      console.error("[Hyp] APISign failed", {
        masof: creds.masof,
        user: creds.user,
        keyLen: creds.key.length,
        keyPrefix: creds.key.slice(0, 8),
        passPLen: creds.passP.length,
        dynamicReturns: envFlag("HYP_ALLOW_DYNAMIC_RETURN_URLS"),
        body: signedQuery.slice(0, 400)
      });
      throw lastError instanceof Error
        ? lastError
        : new Error(authFailureMessage(signedQuery));
    }

    // Docs: append the SIGN response as-is (preserve order); drop KEY/PassP only.
    const safeQuery = stripSecretsPreserveOrder(signedQuery);
    const checkoutUrl = `${creds.payBaseUrl}?${safeQuery}`;

    console.info("[Hyp] APISign ok", {
      payBase: creds.payBaseUrl,
      masof: creds.masof,
      order,
      bookingId: input.bookingId
    });

    return {
      checkoutUrl,
      signedQuery: safeQuery,
      order,
      sessionId: `hyp_${order}_${Date.now()}`
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Hyp payment initiation timed out.");
    }
    if (error instanceof Error) throw error;
    throw new Error(`Hyp payment network error: ${String(error)}`);
  } finally {
    clearTimeout(timeoutId);
  }
}
