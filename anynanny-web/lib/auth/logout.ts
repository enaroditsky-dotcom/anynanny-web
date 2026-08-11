import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { clearDeviceAuthHints } from "@/lib/auth/returning-user";
import { setBroadcastMinimized } from "@/lib/broadcast/broadcast-minimize-preference";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** Clears Supabase session, local auth hints, and redirects home. */
export async function logoutAndRedirect(
  router: AppRouterInstance,
  redirectPath = "/"
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  clearDeviceAuthHints();
  // UI preference only — does not cancel or mutate an active broadcast.
  setBroadcastMinimized(false);
  router.replace(redirectPath);
  router.refresh();
}
