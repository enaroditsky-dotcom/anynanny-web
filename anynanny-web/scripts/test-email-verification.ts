import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readAuthCallbackParams } from "../lib/auth/password-reset";
import {
  CONFIRM_SIGNUP_EMAIL_TEMPLATE_HREF,
  EMAIL_VERIFIED_BODY_LOGIN,
  EMAIL_VERIFIED_LOGIN_CTA,
  EMAIL_VERIFIED_PATH,
  EMAIL_VERIFIED_TITLE,
  EMAIL_VERIFY_EXPIRED_TITLE,
  emailVerifiedLoginHref,
  isConsumedOrExpiredOtpError,
  isMissingPkceVerifierError,
  resolveSignupEmailVerification,
  signupOtpType
} from "../lib/auth/email-verification";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const verified = read("app/auth/verified/page.tsx");
const helper = read("lib/auth/email-verification.ts");
const register = read("app/register/page.tsx");
const signUp = read("app/auth/sign-up/page.tsx");
const resetPassword = read("app/auth/reset-password/page.tsx");
const middleware = read("middleware.ts");
const client = read("lib/supabase/client.ts");
const shell = read("components/app-shell-gate.tsx");

function emptyParams(overrides: Partial<ReturnType<typeof readAuthCallbackParams>> = {}) {
  return {
    hasError: false,
    hasCode: false,
    hasTokenHash: false,
    isRecoveryType: false,
    callbackType: "",
    code: null,
    tokenHash: null,
    ...overrides
  };
}

async function main() {
  assert.equal(EMAIL_VERIFIED_PATH, "/auth/verified");
  assert.equal(
    CONFIRM_SIGNUP_EMAIL_TEMPLATE_HREF,
    "{{ .SiteURL }}/auth/verified?token_hash={{ .TokenHash }}&type=signup"
  );
  assert.equal(signupOtpType("signup"), "signup");
  assert.equal(signupOtpType("email"), "email");
  assert.equal(signupOtpType(""), "signup");
  assert.equal(emailVerifiedLoginHref(), "/login");

  const tokenParams = readAuthCallbackParams("?token_hash=abc&type=signup", "");
  assert.equal(tokenParams.hasTokenHash, true);
  assert.equal(tokenParams.tokenHash, "abc");
  assert.equal(tokenParams.callbackType, "signup");
  assert.equal(tokenParams.hasCode, false);

  const codeParams = readAuthCallbackParams("?code=legacy-pkce", "");
  assert.equal(codeParams.hasCode, true);
  assert.equal(codeParams.code, "legacy-pkce");
  assert.equal(codeParams.hasTokenHash, false);

  let verifyCalls = 0;
  const tokenOk = await resolveSignupEmailVerification({
    params: emptyParams({
      hasTokenHash: true,
      tokenHash: "abc",
      callbackType: "signup"
    }),
    getSession: async () => ({ session: null }),
    verifyOtp: async (args) => {
      verifyCalls += 1;
      assert.equal(args.token_hash, "abc");
      assert.equal(args.type, "signup");
      return { data: { session: { user: { id: "u1" } }, user: { id: "u1" } }, error: null };
    },
    exchangeCodeForSession: async () => {
      throw new Error("must not exchange when token_hash succeeds");
    }
  });
  assert.equal(tokenOk.view, "success_session");
  assert.equal(tokenOk.exchangedCode, false);
  assert.equal(verifyCalls, 1);

  const tokenInvalid = await resolveSignupEmailVerification({
    params: emptyParams({
      hasTokenHash: true,
      tokenHash: "bad",
      callbackType: "signup"
    }),
    getSession: async () => ({ session: null }),
    verifyOtp: async () => ({
      data: { session: null, user: null },
      error: { code: "validation_failed", message: "invalid token" }
    }),
    exchangeCodeForSession: async () => {
      throw new Error("must not exchange invalid token_hash without code");
    }
  });
  assert.equal(tokenInvalid.view, "expired");

  let exchangeCalls = 0;
  const legacyCode = await resolveSignupEmailVerification({
    params: emptyParams({ hasCode: true, code: "legacy-pkce" }),
    getSession: async () => ({ session: null }),
    verifyOtp: async () => {
      throw new Error("legacy code must not verifyOtp");
    },
    exchangeCodeForSession: async (code) => {
      exchangeCalls += 1;
      assert.equal(code, "legacy-pkce");
      return { data: { session: { user: { id: "u2" } } }, error: null };
    }
  });
  assert.equal(legacyCode.view, "success_session");
  assert.equal(legacyCode.exchangedCode, true);
  assert.equal(exchangeCalls, 1);

  const skipSecondExchange = await resolveSignupEmailVerification({
    params: emptyParams({ hasCode: true, code: "already-exchanged" }),
    getSession: async () => ({ session: { user: { id: "u3" } } }),
    verifyOtp: async () => {
      throw new Error("session already present");
    },
    exchangeCodeForSession: async () => {
      throw new Error("must not double-exchange code");
    }
  });
  assert.equal(skipSecondExchange.view, "success_session");
  assert.equal(skipSecondExchange.exchangedCode, false);

  const missingVerifier = await resolveSignupEmailVerification({
    params: emptyParams({ hasCode: true, code: "no-cookie" }),
    getSession: async () => ({ session: null }),
    verifyOtp: async () => {
      throw new Error("pkce miss must not verifyOtp");
    },
    exchangeCodeForSession: async () => ({
      data: { session: null },
      error: {
        name: "AuthPKCECodeVerifierMissingError",
        code: "pkce_code_verifier_not_found",
        message: "PKCE code verifier not found in storage."
      }
    })
  });
  assert.equal(missingVerifier.view, "success_login");
  assert.equal(missingVerifier.exchangedCode, true);
  assert.equal(isMissingPkceVerifierError({ code: "pkce_code_verifier_not_found" }), true);
  assert.equal(isConsumedOrExpiredOtpError({ code: "otp_expired" }), true);

  assert.match(verified, /resolveSignupEmailVerification/);
  assert.match(verified, /verifyOtp/);
  assert.match(verified, /exchangeCodeForSession/);
  assert.match(verified, /EMAIL_VERIFIED_BODY_LOGIN/);
  assert.match(verified, /navigateAfterAuth/);
  assert.match(verified, /EMAIL_VERIFY_EXPIRED_TITLE/);
  assert.equal(EMAIL_VERIFIED_TITLE, "האימייל אומת בהצלחה");
  assert.equal(EMAIL_VERIFIED_BODY_LOGIN, "החשבון שלך אומת. אפשר להתחבר ל־AnyNanny ולהמשיך.");
  assert.equal(EMAIL_VERIFIED_LOGIN_CTA, "להתחברות");
  assert.equal(EMAIL_VERIFY_EXPIRED_TITLE, "הקישור פג תוקף או שגוי");

  assert.match(register, /emailRedirectTo: `\$\{window\.location\.origin\}\/auth\/verified`/);
  assert.match(signUp, /emailRedirectTo: `\$\{window\.location\.origin\}\/auth\/verified`/);

  assert.match(resetPassword, /exchangeCodeForSession/);
  assert.match(resetPassword, /type: "recovery"/);
  assert.match(resetPassword, /PASSWORD_RECOVERY/);
  assert.doesNotMatch(resetPassword, /resolveSignupEmailVerification/);
  assert.doesNotMatch(resetPassword, /EMAIL_VERIFIED_BODY_LOGIN/);

  assert.match(middleware, /auth\//);
  assert.doesNotMatch(middleware, /\/auth\/verified/);
  assert.match(shell, /"\/auth\/verified"/);

  assert.match(client, /createBrowserClient/);
  assert.doesNotMatch(client, /detectSessionInUrl:\s*false/);
  assert.doesNotMatch(client, /flowType:\s*"implicit"/);

  assert.match(helper, /getSession first/);
  assert.match(verified, /getSession:/);

  const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: root,
    encoding: "utf8"
  }).trim();
  const gitFiles = execFileSync("git", ["status", "--porcelain", "--", "android", "twa"], {
    cwd: gitRoot,
    encoding: "utf8"
  }).trim();
  assert.equal(gitFiles, "", `Android/TWA files must be untouched, got:\n${gitFiles}`);
  assert.equal(existsSync(resolve(gitRoot, "android/app/build.gradle.kts")), true);
  assert.equal(readdirSync(resolve(gitRoot, "android")).includes("app"), true);

  console.log("email-verification: ok");
}

void main();
