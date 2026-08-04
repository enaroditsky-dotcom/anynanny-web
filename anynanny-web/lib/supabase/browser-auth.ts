import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type BrowserAuthResult =
  | { ok: true; supabase: SupabaseClient; userId: string }
  | { ok: false; reason: "no_client" | "not_signed_in" };

/** Resolves the signed-in user via `getSession` + `getUser` before any RLS-protected write. */
export async function resolveBrowserAuth(): Promise<BrowserAuthResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, reason: "no_client" };
  const { data: sessionData } = await supabase.auth.getSession();
  const fromSession = sessionData.session?.user ?? null;
  const { data: authData, error } = await supabase.auth.getUser();
  const user = authData.user ?? fromSession;
  if (error && !user) return { ok: false, reason: "not_signed_in" };
  if (!user?.id) return { ok: false, reason: "not_signed_in" };
  return { ok: true, supabase, userId: user.id };
}
