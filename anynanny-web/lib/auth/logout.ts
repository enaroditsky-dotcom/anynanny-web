import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { clearDeviceAuthHints } from "@/lib/auth/returning-user";
import { setBroadcastMinimized } from "@/lib/broadcast/broadcast-minimize-preference";
import { unsubscribeCurrentPushSubscription } from "@/lib/push/register-push";
import { clearParentDisplayIdCache } from "@/lib/public/sequential-display-id";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** Clears this device's push subscription, session, local auth hints, and redirects home. */
export async function logoutAndRedirect(
  router: AppRouterInstance,
  redirectPath = "/"
): Promise<void> {
  try {
    await unsubscribeCurrentPushSubscription();
  } catch {
    /* best-effort: still sign out */
  }
  const supabase = getSupabaseBrowserClient();
  let userId: string | undefined;
  if (supabase) {
    try {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id;
    } catch {
      /* still sign out */
    }
    await supabase.auth.signOut();
  }
  clearParentDisplayIdCache(userId);
  clearDeviceAuthHints();
  // UI preference only — does not cancel or mutate an active broadcast.
  setBroadcastMinimized(false);
  router.replace(redirectPath);
  router.refresh();
}
