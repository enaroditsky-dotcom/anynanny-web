export const MARKETING_LIKE_TOKEN_BYTES = 32;
export const MARKETING_LIKE_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
export const MARKETING_LIKE_TOKEN_STORAGE_KEY = "anynanny.marketing.like.token";
export const MARKETING_LIKE_CONFIRMED_STORAGE_KEY = "anynanny.marketing.like.confirmed";
export const MARKETING_LIKE_MAX_BODY_BYTES = 512;

export const MARKETING_LIKE_SUCCESS_MESSAGE = "תודה על הלב!";
export const MARKETING_LIKE_ERROR_MESSAGE = "לא הצלחנו לשמור את הלב. נסו שוב.";
export const MARKETING_LIKE_UNAVAILABLE_MESSAGE =
  "שמירת הלב אינה זמינה כרגע. נסו שוב מאוחר יותר.";

export type LikeRecordStatus = "inserted" | "duplicate";

export type ParsedLikeToken =
  | { ok: true; token: string }
  | { ok: false; error: string };

export function normalizeMarketingLikeToken(value: string): string {
  return value.trim().toLowerCase();
}

export function isMarketingLikeToken(value: string): boolean {
  return MARKETING_LIKE_TOKEN_PATTERN.test(normalizeMarketingLikeToken(value));
}

export function generateMarketingLikeToken(): string {
  const bytes = new Uint8Array(MARKETING_LIKE_TOKEN_BYTES);
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("Crypto is unavailable.");
  }
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function parseLikeRequestBody(body: unknown): ParsedLikeToken {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "בקשה לא תקינה." };
  }
  const token = (body as { token?: unknown }).token;
  if (typeof token !== "string" || !isMarketingLikeToken(token)) {
    return { ok: false, error: "בקשה לא תקינה." };
  }
  return { ok: true, token: normalizeMarketingLikeToken(token) };
}
