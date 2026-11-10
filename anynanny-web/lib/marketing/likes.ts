/**
 * Stored likes stay off until `20260910140000_marketing_homepage_likes.sql`
 * is applied in a later release. The heart remains on the page and does not
 * call the API while this is false.
 */
export const MARKETING_LIKES_PERSISTENCE_ENABLED = false;

export const MARKETING_LIKE_TOKEN_BYTES = 32;
export const MARKETING_LIKE_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
export const MARKETING_LIKE_TOKEN_STORAGE_KEY = "anynanny.marketing.like.token";
export const MARKETING_LIKE_CONFIRMED_STORAGE_KEY = "anynanny.marketing.like.confirmed";
export const MARKETING_LIKE_UNAVAILABLE_STORAGE_KEY = "anynanny.marketing.like.unavailable";
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

/** One missing-table response is enough. Later clicks must not call the API again. */
export function canSubmitMarketingLike(input: {
  persistenceEnabled?: boolean;
  pressed: boolean;
  pending: boolean;
  unavailable: boolean;
}): boolean {
  const persistenceEnabled = input.persistenceEnabled ?? MARKETING_LIKES_PERSISTENCE_ENABLED;
  return persistenceEnabled && !input.pressed && !input.pending && !input.unavailable;
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
