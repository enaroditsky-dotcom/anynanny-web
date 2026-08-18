import type { AuthError } from "@supabase/supabase-js";
import type { ProfileRole } from "@/lib/supabase/profiles";

export const RESET_PASSWORD_PATH = "/auth/reset-password";
export const FORGOT_PASSWORD_PATH = "/auth/forgot-password";
export const LOGIN_PATH = "/login";

export const RESET_EMAIL_SENT_MESSAGE =
  "אם קיים חשבון עם כתובת האימייל הזו, נשלח אליך קישור לאיפוס הסיסמה.";

export const INVALID_RECOVERY_LINK_MESSAGE =
  "הקישור לאיפוס הסיסמה אינו תקף או שפג תוקפו.";

export const PASSWORD_UPDATED_MESSAGE = "הסיסמה עודכנה בהצלחה";

export const EMAIL_REQUIRED_MESSAGE = "נא להזין כתובת אימייל.";
export const EMAIL_INVALID_MESSAGE = "נא להזין כתובת אימייל תקינה.";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateResetEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return EMAIL_REQUIRED_MESSAGE;
  if (!EMAIL_PATTERN.test(trimmed)) return EMAIL_INVALID_MESSAGE;
  return null;
}

/** Same origin strategy as signup (`window.location.origin`), never a hardcoded host. */
export function getBrowserAppOrigin(): string {
  return window.location.origin.replace(/\/$/, "");
}

export function getPasswordResetRedirectTo(): string {
  return `${getBrowserAppOrigin()}${RESET_PASSWORD_PATH}`;
}

export function loginHref(role?: string | null, track?: string | null): string {
  const params = new URLSearchParams();
  if (role === "parent" || role === "sitter") params.set("role", role);
  if (track?.trim()) params.set("track", track.trim());
  const qs = params.toString();
  return qs ? `${LOGIN_PATH}?${qs}` : LOGIN_PATH;
}

export function forgotPasswordHref(role?: string | null, track?: string | null): string {
  const params = new URLSearchParams();
  if (role === "parent" || role === "sitter") params.set("role", role);
  if (track?.trim()) params.set("track", track.trim());
  const qs = params.toString();
  return qs ? `${FORGOT_PASSWORD_PATH}?${qs}` : FORGOT_PASSWORD_PATH;
}

export function parseAuthRoleParam(value: string | null): ProfileRole | null {
  return value === "parent" || value === "sitter" ? value : null;
}

export type AuthCallbackParams = {
  hasError: boolean;
  hasCode: boolean;
  hasTokenHash: boolean;
  isRecoveryType: boolean;
  code: string | null;
  tokenHash: string | null;
};

export function readAuthCallbackParams(
  search = typeof window === "undefined" ? "" : window.location.search,
  hash = typeof window === "undefined" ? "" : window.location.hash
): AuthCallbackParams {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const hashQuery = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);

  const error =
    query.get("error") ||
    query.get("error_code") ||
    hashQuery.get("error") ||
    hashQuery.get("error_code");

  const type = (query.get("type") || hashQuery.get("type") || "").toLowerCase();
  const code = query.get("code") || hashQuery.get("code");
  const tokenHash = query.get("token_hash") || hashQuery.get("token_hash");

  return {
    hasError: Boolean(error),
    hasCode: Boolean(code),
    hasTokenHash: Boolean(tokenHash),
    isRecoveryType: type === "recovery",
    code,
    tokenHash
  };
}

export function hasRecoveryUrlMarker(params: AuthCallbackParams): boolean {
  return params.hasCode || params.isRecoveryType || (params.hasTokenHash && params.isRecoveryType);
}

export function isPasswordRecoveryDestinationPath(pathname: string): boolean {
  return pathname === RESET_PASSWORD_PATH || pathname.startsWith(`${RESET_PASSWORD_PATH}/`);
}

/** Full current callback URL for `/auth/reset-password` (keeps query + hash). */
export function resetPasswordCallbackHref(): string {
  if (typeof window === "undefined") return RESET_PASSWORD_PATH;
  return `${RESET_PASSWORD_PATH}${window.location.search}${window.location.hash}`;
}

/**
 * If this page received a recovery callback, send it to `/auth/reset-password`
 * without dropping hash fragments. PKCE recovery often has only `?code=`.
 */
export function forwardExplicitRecoveryCallback(): boolean {
  if (typeof window === "undefined") return false;
  if (isPasswordRecoveryDestinationPath(window.location.pathname)) return false;

  const params = readAuthCallbackParams();
  if (!params.hasCode && !params.isRecoveryType && !params.hasTokenHash) {
    return false;
  }

  window.location.replace(resetPasswordCallbackHref());
  return true;
}

/** Site-URL fallback: `/?code=` must not stay on the landing page. */
export function shouldForwardRootAuthCallback(
  pathname: string,
  searchParams: { get(name: string): string | null; has(name: string): boolean }
): boolean {
  if (pathname !== "/") return false;
  const type = (searchParams.get("type") || "").toLowerCase();
  return searchParams.has("code") || type === "recovery";
}

export function forwardToResetPasswordNow(): void {
  if (typeof window === "undefined") return;
  if (isPasswordRecoveryDestinationPath(window.location.pathname)) return;
  window.location.replace(resetPasswordCallbackHref());
}

function errorText(error: { message?: string; status?: number; code?: string } | null | undefined): string {
  return `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
}

function logDevAuthError(context: string, error: unknown): void {
  if (process.env.NODE_ENV === "development") {
    console.warn(`[password-reset] ${context}:`, error);
  }
}

/**
 * Maps reset-email failures without revealing whether the address exists.
 * Unknown / "not found" style errors still resolve to the same success copy.
 */
export function userFacingResetEmailError(error: AuthError | null | undefined): string | null {
  if (!error) return null;

  const text = errorText(error);
  const status = error.status ?? 0;

  if (
    /user not found|unable to confirm|email not found|signups not allowed/i.test(text)
  ) {
    return null;
  }

  if (status === 429 || /rate limit|too many requests|only request this after/i.test(text)) {
    logDevAuthError("reset email rate limit", error);
    return "נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות.";
  }

  if (status === 0 || /failed to fetch|network|load failed|offline/i.test(text)) {
    logDevAuthError("reset email network", error);
    return "לא הצלחנו להתחבר לשרת. בדקו את החיבור ונסו שוב.";
  }

  logDevAuthError("reset email unexpected", error);
  return "משהו השתבש. נסו שוב מאוחר יותר.";
}

export function userFacingUpdatePasswordError(error: AuthError | null | undefined): string {
  if (!error) return "משהו השתבש. נסו שוב מאוחר יותר.";

  const text = errorText(error);
  const status = error.status ?? 0;

  if (status === 429 || /rate limit|too many requests/i.test(text)) {
    logDevAuthError("update password rate limit", error);
    return "נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות.";
  }

  if (
    /same password|should be different|different from the old/i.test(text)
  ) {
    return "יש לבחור סיסמה שונה מהסיסמה הנוכחית.";
  }

  if (/weak|at least|too short|password/i.test(text) && /6|characters|length/i.test(text)) {
    return "הסיסמה חייבת להכיל לפחות 6 תווים.";
  }

  if (
    status === 401 ||
    /session|not authenticated|invalid claim|expired|jwt/i.test(text)
  ) {
    return INVALID_RECOVERY_LINK_MESSAGE;
  }

  if (status === 0 || /failed to fetch|network|load failed|offline/i.test(text)) {
    logDevAuthError("update password network", error);
    return "לא הצלחנו להתחבר לשרת. בדקו את החיבור ונסו שוב.";
  }

  logDevAuthError("update password unexpected", error);
  return "לא הצלחנו לעדכן את הסיסמה. נסו שוב מאוחר יותר.";
}

export function isLikelyNetworkError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|network|load failed|offline/i.test(message);
}

export const GENERIC_NETWORK_MESSAGE =
  "לא הצלחנו להתחבר לשרת. בדקו את החיבור ונסו שוב.";
