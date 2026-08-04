import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { clearDeviceAuthHints } from "@/lib/auth/returning-user";
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
  router.replace(redirectPath);
  router.refresh();
}
