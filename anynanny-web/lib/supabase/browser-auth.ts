import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveValidAuthUser } from "@/lib/auth/valid-session";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type BrowserAuthClient = Parameters<typeof resolveValidAuthUser>[0];

export type BrowserAuthFailureReason = "no_client" | "unavailable" | "signed_out" | "invalid_session";

export type BrowserAuthResult =
  | { ok: true; supabase: SupabaseClient; userId: string }
  | { ok: false; reason: BrowserAuthFailureReason };

/**
 * Server-verified browser user.
 * A getSession() user is not authentication when getUser() fails.
 * Unavailable keeps the Supabase session and must not authorize reads or writes.
 */
export async function resolveBrowserAuth(
  supabase: BrowserAuthClient = getSupabaseBrowserClient()
): Promise<BrowserAuthResult> {
  if (!supabase) return { ok: false, reason: "no_client" };

  const resolved = await resolveValidAuthUser(supabase);
  if (resolved.ok) {
    return { ok: true, supabase: supabase as SupabaseClient, userId: resolved.user.id };
  }
  if (resolved.reason === "unavailable") return { ok: false, reason: "unavailable" };
  if (resolved.reason === "invalid_session") return { ok: false, reason: "invalid_session" };
  return { ok: false, reason: "signed_out" };
}

/** Copy for a refused action. Unavailable is not a signed-out result. */
export function browserAuthFailureMessage(reason: BrowserAuthFailureReason, signedOutMessage: string): string {
  if (reason === "no_client") return "Supabase לא מוגדר.";
  if (reason === "unavailable") return "אין חיבור כרגע. נסו שוב בעוד רגע.";
  return signedOutMessage;
}
