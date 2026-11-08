import type { SupabaseClient, User } from "@supabase/supabase-js";
import { readSupabaseErrorMessage } from "@/lib/supabase/postgrest-schema";

export type ValidAuthUserResult =
  | { ok: true; user: User; clearedStaleSession: false }
  | {
      ok: false;
      user: null;
      clearedStaleSession: boolean;
      reason: "no_client" | "signed_out" | "invalid_session" | "unavailable";
    };

type AuthLike = {
  getUser: () => Promise<{ data: { user: User | null }; error: unknown }>;
  getSession: () => Promise<{
    data: { session: { access_token?: string; user?: { id?: string } | null } | null };
    error?: unknown;
  }>;
  signOut: (options?: { scope?: "local" | "global" | "others" }) => Promise<unknown>;
};

/**
 * Server-confirmed revocation. Access-token expiry and transport failures are
 * intentionally absent: the Supabase client refreshes those, and a blip must
 * not delete the refresh token.
 */
const CONCLUSIVE_INVALIDATION_CODES = new Set([
  "refresh_token_not_found",
  "refresh_token_already_used",
  "invalid_refresh_token",
  "session_not_found",
  "session_expired",
  "user_banned",
  "user_not_found"
]);

const CONCLUSIVE_INVALIDATION_MESSAGES = [
  "invalid refresh token",
  "refresh token not found",
  "refresh token already used",
  "refresh token has been revoked",
  "session from session_id claim in jwt does not exist",
  "user from sub claim in jwt does not exist",
  "user is banned",
  "user banned"
];

let staleClearInFlight: Promise<void> | null = null;

function errorRecord(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== "object") return null;
  return error as Record<string, unknown>;
}

function errorCode(error: unknown): string {
  const record = errorRecord(error);
  const code = record && typeof record.code === "string" ? record.code.trim().toLowerCase() : "";
  return code;
}

function errorName(error: unknown): string {
  if (error instanceof Error) return error.name;
  const record = errorRecord(error);
  return record && typeof record.name === "string" ? record.name : "";
}

function errorStatus(error: unknown): number | null {
  const record = errorRecord(error);
  if (!record) return null;
  if (typeof record.status === "number") return record.status;
  if (typeof record.statusCode === "number") return record.statusCode;
  return null;
}

/** True only when the auth server has confirmed this session cannot continue. */
export function isConclusiveSessionInvalidation(error: unknown): boolean {
  if (!error) return false;
  if (CONCLUSIVE_INVALIDATION_CODES.has(errorCode(error))) return true;
  const message = readSupabaseErrorMessage(error).toLowerCase();
  if (message.includes("jwt expired") || message.includes("token is expired")) return false;
  return CONCLUSIVE_INVALIDATION_MESSAGES.some((pattern) => message.includes(pattern));
}

/**
 * Transport and temporary auth-server failures. These must not call signOut.
 * `jwt expired` is included so an access token can still be refreshed.
 */
export function isTransientAuthFailure(error: unknown): boolean {
  if (!error || isConclusiveSessionInvalidation(error)) return false;
  const name = errorName(error);
  if (
    name === "AuthRetryableFetchError" ||
    name === "AbortError" ||
    name === "TimeoutError" ||
    name === "NetworkError" ||
    name === "TypeError"
  ) {
    const message = readSupabaseErrorMessage(error).toLowerCase();
    if (name !== "TypeError") return true;
    if (
      message.includes("failed to fetch") ||
      message.includes("network") ||
      message.includes("load failed") ||
      message.includes("fetch failed")
    ) {
      return true;
    }
  }
  const code = errorCode(error);
  if (code === "auth_retryable_fetch_error" || code === "request_timeout" || code === "network_error") {
    return true;
  }
  const status = errorStatus(error);
  if (status === 0 || status === 408 || status === 429 || (status !== null && status >= 500)) return true;
  const message = readSupabaseErrorMessage(error).toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("load failed") ||
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("enotfound") ||
    message.includes("jwt expired") ||
    message.includes("token is expired") ||
    message.includes("temporarily unavailable") ||
    message.includes("service unavailable")
  );
}

/** @deprecated Use isConclusiveSessionInvalidation. Generic 401/403 is not revocation. */
export function isAuthUserRejectedError(error: unknown): boolean {
  return isConclusiveSessionInvalidation(error);
}

export function shouldClearStaleSession(input: {
  user: { id: string } | null;
  error: unknown;
  hasLocalSession: boolean;
}): boolean {
  if (!isConclusiveSessionInvalidation(input.error)) return false;
  return input.hasLocalSession || Boolean(input.user);
}

/**
 * A getSession() user is not server verification. Callers may keep a previous
 * UI user only for continuity; protected reads still go through Supabase RLS
 * and getUser() on the server.
 */
export function isServerVerifiedAuthUser(resolved: ValidAuthUserResult): boolean {
  return resolved.ok === true;
}

/** Keeps the previous UI user across a temporary failure. Never promotes getSession() to verified. */
export function retainedUserAfterAuthResolution(
  previousUser: User | null,
  resolved: ValidAuthUserResult
): User | null {
  if (resolved.ok) return resolved.user;
  if (resolved.reason === "unavailable") return previousUser;
  return null;
}

/** next=/auth/role-selection must not navigate until getUser() confirms a real user. */
export function canHonorAuthNextParam(hasValidUser: boolean): boolean {
  return hasValidUser;
}

/**
 * Gate for screens that used to redirect to login whenever getUser() returned
 * no user. Unavailable keeps the session and must not reveal account data.
 * signed_out covers a missing session and a confirmed revocation.
 */
export function protectedScreenGate(
  resolved: ValidAuthUserResult
): { status: "verified"; user: User } | { status: "unavailable" } | { status: "signed_out" } {
  if (resolved.ok) return { status: "verified", user: resolved.user };
  if (resolved.reason === "unavailable") return { status: "unavailable" };
  return { status: "signed_out" };
}

export async function clearStaleBrowserSession(auth: Pick<AuthLike, "signOut">): Promise<void> {
  if (staleClearInFlight) {
    await staleClearInFlight;
    return;
  }
  staleClearInFlight = (async () => {
    try {
      await auth.signOut({ scope: "local" });
    } catch {
      /* local storage may already be empty */
    }
  })();
  try {
    await staleClearInFlight;
  } finally {
    staleClearInFlight = null;
  }
}

export async function resolveValidAuthUser(
  supabase: Pick<SupabaseClient, "auth"> | { auth: AuthLike } | null
): Promise<ValidAuthUserResult> {
  if (!supabase) {
    return { ok: false, user: null, clearedStaleSession: false, reason: "no_client" };
  }

  let user: User | null = null;
  let error: unknown = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    error = result.error;
  } catch (caught) {
    error = caught;
  }

  if (user && !isConclusiveSessionInvalidation(error)) {
    return { ok: true, user, clearedStaleSession: false };
  }

  let hasLocalSession = false;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    hasLocalSession = Boolean(sessionData.session);
  } catch (sessionError) {
    if (!isConclusiveSessionInvalidation(error)) {
      return { ok: false, user: null, clearedStaleSession: false, reason: "unavailable" };
    }
    // The auth server already rejected the session. Drop cookies even if
    // reading them failed.
    hasLocalSession = true;
    error = error ?? sessionError;
  }

  if (
    shouldClearStaleSession({
      user,
      error,
      hasLocalSession
    })
  ) {
    await clearStaleBrowserSession(supabase.auth);
    return { ok: false, user: null, clearedStaleSession: true, reason: "invalid_session" };
  }

  if (hasLocalSession) {
    return { ok: false, user: null, clearedStaleSession: false, reason: "unavailable" };
  }

  if (isConclusiveSessionInvalidation(error)) {
    return { ok: false, user: null, clearedStaleSession: false, reason: "invalid_session" };
  }

  return { ok: false, user: null, clearedStaleSession: false, reason: "signed_out" };
}
