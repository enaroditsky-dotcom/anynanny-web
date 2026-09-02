/**
 * Optional sitter PayBox personal payment link.
 * HTTPS only. Allowlisted PayBox hosts. Never a custom PayBox URI scheme.
 */

export const PAYBOX_PAYMENT_LINK_MAX_LENGTH = 2048;

/** Documented PayBox Israel payment / share hosts. */
const PAYBOX_LINK_HOSTS = new Set([
  "payboxapp.com",
  "www.payboxapp.com",
  "links.payboxapp.com",
  "app.payboxapp.com",
  "payboxapp.page.link"
]);

export function normalizePayboxPaymentLink(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
}

function isAllowedPayboxHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host || host.includes("..")) return false;
  if (PAYBOX_LINK_HOSTS.has(host)) return true;
  return host.endsWith(".payboxapp.com") && host.split(".").filter(Boolean).length >= 3;
}

export function isValidPayboxPaymentLink(raw: string | null | undefined): boolean {
  const value = normalizePayboxPaymentLink(raw);
  if (!value) return false;
  if (value.length > PAYBOX_PAYMENT_LINK_MAX_LENGTH) return false;
  const lower = value.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("file:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("paybox:")
  ) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.port && parsed.port !== "443") return false;
  if (!isAllowedPayboxHost(parsed.hostname)) return false;
  return true;
}

/** Empty is allowed (clears the stored link). Non-empty must be a valid PayBox HTTPS URL. */
export function validateOptionalPayboxPaymentLink(raw: string | null | undefined): string | null {
  const value = normalizePayboxPaymentLink(raw);
  if (!value) return null;
  if (!isValidPayboxPaymentLink(value)) {
    return "יש להזין קישור PayBox תקין (HTTPS בלבד, דומיין PayBox).";
  }
  return null;
}

/** Returns the normalized HTTPS PayBox URL, or null if missing/unsafe. */
export function parseAuthorizedPayboxPaymentLink(
  raw: string | null | undefined
): string | null {
  const value = normalizePayboxPaymentLink(raw);
  if (!value || !isValidPayboxPaymentLink(value)) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}
