/**
 * Safe helpers for Supabase auth cookie values.
 *
 * `@supabase/ssr` (default `cookieEncoding: "base64url"`) stores session cookies as:
 *   `base64-<base64url(JSON.stringify(session))>`
 *
 * Legacy auth-helpers and ad-hoc `JSON.parse(cookie)` calls crash with:
 *   SyntaxError: Unexpected token 'b', "base64-eyJ"... is not valid JSON
 *
 * Always use these helpers (or `@supabase/ssr` itself) — never raw JSON.parse on cookie values.
 */

export const SUPABASE_BASE64_COOKIE_PREFIX = "base64-" as const;

/** Decode a Base64-URL payload to a UTF-8 string (Node + browser). Never throws. */
export function decodeBase64UrlToUtf8(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + "=".repeat(padLength);

    if (typeof Buffer !== "undefined") {
      return Buffer.from(padded, "base64").toString("utf8");
    }

    if (typeof atob === "function") {
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder().decode(bytes);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * If the value uses the SSR `base64-` prefix, return the decoded UTF-8 payload
 * (typically a JSON string). Otherwise return the original value unchanged.
 * Never throws.
 */
export function decodeSupabaseCookieValue(raw: string): string {
  if (!raw.startsWith(SUPABASE_BASE64_COOKIE_PREFIX)) {
    return raw;
  }

  const decoded = decodeBase64UrlToUtf8(raw.slice(SUPABASE_BASE64_COOKIE_PREFIX.length));
  return decoded ?? raw;
}

/**
 * Safely parse a Supabase auth cookie value to JSON.
 * Handles both legacy plain-JSON cookies and SSR `base64-...` cookies.
 * Returns `null` on empty/invalid input — never throws SyntaxError.
 */
export function safeParseSupabaseCookieJson<T = unknown>(
  raw: string | null | undefined
): T | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  try {
    const payload = decodeSupabaseCookieValue(trimmed);
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}
