import type { EmailOtpType } from "@supabase/supabase-js";
import type { AuthCallbackParams } from "@/lib/auth/password-reset";
import { LOGIN_PATH } from "@/lib/auth/password-reset";

export const EMAIL_VERIFIED_PATH = "/auth/verified";

/**
 * Confirm signup template href from official Supabase variables
 * (`{{ .SiteURL }}`, `{{ .TokenHash }}`). Site URL is https://www.anynanny.org.
 * `type=signup` matches this page; `type=email` is also accepted.
 */
export const CONFIRM_SIGNUP_EMAIL_TEMPLATE_HREF =
  "{{ .SiteURL }}/auth/verified?token_hash={{ .TokenHash }}&type=signup";

export const EMAIL_VERIFIED_TITLE = "האימייל אומת בהצלחה";
export const EMAIL_VERIFIED_BODY_LOGIN =
  "החשבון שלך אומת. אפשר להתחבר ל־AnyNanny ולהמשיך.";
export const EMAIL_VERIFIED_LOGIN_CTA = "להתחברות";
export const EMAIL_VERIFY_EXPIRED_TITLE = "הקישור פג תוקף או שגוי";

export type SignupVerifyView = "expired" | "success_session" | "success_login";

export type SignupVerifyResult = {
  view: SignupVerifyView;
  exchangedCode: boolean;
};

type AuthErr = { message?: string; code?: string; name?: string } | null | undefined;

export function signupOtpType(callbackType: string): EmailOtpType {
  if (
    callbackType === "signup" ||
    callbackType === "email" ||
    callbackType === "email_change" ||
    callbackType === "invite"
  ) {
    return callbackType;
  }
  return "signup";
}

export function isMissingPkceVerifierError(error: AuthErr): boolean {
  if (!error) return false;
  const blob = `${error.name ?? ""} ${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return (
    error.code === "pkce_code_verifier_not_found" ||
    error.name === "AuthPKCECodeVerifierMissingError" ||
    blob.includes("pkce code verifier") ||
    blob.includes("code verifier not found")
  );
}

export function isConsumedOrExpiredOtpError(error: AuthErr): boolean {
  if (!error) return false;
  const blob = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return (
    error.code === "otp_expired" ||
    /otp_expired|token has expired|already been used/i.test(blob)
  );
}

export function emailVerifiedLoginHref(): string {
  return LOGIN_PATH;
}

/**
 * Decide the verified-page outcome.
 * A GoTrue `?code=` is only issued after /auth/v1/verify succeeds, so a missing
 * PKCE verifier must not be shown as an expired link.
 * Call getSession first so detectSessionInUrl can finish before any manual exchange.
 */
export async function resolveSignupEmailVerification(input: {
  params: Pick<AuthCallbackParams, "hasCode" | "hasTokenHash" | "hasError" | "callbackType" | "code" | "tokenHash">;
  getSession: () => Promise<{ session: { user?: { id?: string } | null } | null }>;
  verifyOtp: (args: {
    type: EmailOtpType;
    token_hash: string;
  }) => Promise<{
    data: { session: { user?: { id?: string } | null } | null; user: { id?: string } | null };
    error: AuthErr;
  }>;
  exchangeCodeForSession: (code: string) => Promise<{
    data: { session: { user?: { id?: string } | null } | null };
    error: AuthErr;
  }>;
}): Promise<SignupVerifyResult> {
  const { params } = input;
  let exchangedCode = false;

  const sessionNow = (await input.getSession()).session;
  if (sessionNow) {
    return { view: "success_session", exchangedCode: false };
  }

  if (params.tokenHash) {
    const { data, error } = await input.verifyOtp({
      type: signupOtpType(params.callbackType),
      token_hash: params.tokenHash
    });
    if (!error && data.session) {
      return { view: "success_session", exchangedCode: false };
    }
    if (!error && data.user) {
      return { view: "success_login", exchangedCode: false };
    }
    if (isConsumedOrExpiredOtpError(error)) {
      return { view: "success_login", exchangedCode: false };
    }
    if (!params.code) {
      return { view: "expired", exchangedCode: false };
    }
  }

  if (params.code) {
    const { data, error } = await input.exchangeCodeForSession(params.code);
    exchangedCode = true;
    if (!error && data.session) {
      return { view: "success_session", exchangedCode };
    }
    const after = (await input.getSession()).session;
    if (after) {
      return { view: "success_session", exchangedCode };
    }
    // `code` is issued only after GoTrue confirms the email.
    return { view: "success_login", exchangedCode };
  }

  if (params.hasError && !params.hasTokenHash && !params.hasCode) {
    return { view: "expired", exchangedCode: false };
  }

  return { view: "expired", exchangedCode: false };
}
