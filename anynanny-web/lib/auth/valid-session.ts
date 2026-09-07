import type { SupabaseClient, User } from "@supabase/supabase-js";
import { readSupabaseErrorMessage } from "@/lib/supabase/postgrest-schema";

export type ValidAuthUserResult =
  | { ok: true; user: User; clearedStaleSession: false }
  | { ok: false; user: null; clearedStaleSession: boolean; reason: "no_client" | "signed_out" | "invalid_session" };

type AuthLike = {
  getUser: () => Promise<{ data: { user: User | null }; error: unknown }>;
  getSession: () => Promise<{ data: { session: { access_token?: string; user?: { id?: string } | null } | null } }>;
  signOut: (options?: { scope?: "local" | "global" | "others" }) => Promise<unknown>;
};

let staleClearInFlight: Promise<void> | null = null;

export function isAuthUserRejectedError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    const status =
      typeof record.status === "number"
        ? record.status
        : typeof record.statusCode === "number"
          ? record.statusCode
          : null;
    if (status === 401 || status === 403) return true;
    const code = typeof record.code === "string" ? record.code.toLowerCase() : "";
    if (
      code === "bad_jwt" ||
      code === "invalid_jwt" ||
      code === "session_not_found" ||
      code === "refresh_token_not_found" ||
      code === "user_banned" ||
      code === "invalid_token"
    ) {
      return true;
    }
  }
  const message = readSupabaseErrorMessage(error).toLowerCase();
  return (
    message.includes("403") ||
    message.includes("401") ||
    message.includes("forbidden") ||
    message.includes("unauthorized") ||
    message.includes("invalid jwt") ||
    message.includes("invalid token") ||
    message.includes("jwt expired") ||
    message.includes("session missing") ||
    message.includes("auth session missing") ||
    message.includes("not authenticated")
  );
}

export function shouldClearStaleSession(input: {
  user: { id: string } | null;
  error: unknown;
  hasLocalSession: boolean;
}): boolean {
  if (input.user && !isAuthUserRejectedError(input.error)) return false;
  if (isAuthUserRejectedError(input.error)) return true;
  return Boolean(input.hasLocalSession && !input.user);
}

/** next=/auth/role-selection must not navigate until getUser() confirms a real user. */
export function canHonorAuthNextParam(hasValidUser: boolean): boolean {
  return hasValidUser;
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

  const { data, error } = await supabase.auth.getUser();
  if (data.user && !isAuthUserRejectedError(error)) {
    return { ok: true, user: data.user, clearedStaleSession: false };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const hasLocalSession = Boolean(sessionData.session);
  if (
    shouldClearStaleSession({
      user: data.user,
      error,
      hasLocalSession
    })
  ) {
    await clearStaleBrowserSession(supabase.auth);
    return { ok: false, user: null, clearedStaleSession: true, reason: "invalid_session" };
  }

  return { ok: false, user: null, clearedStaleSession: false, reason: "signed_out" };
}
