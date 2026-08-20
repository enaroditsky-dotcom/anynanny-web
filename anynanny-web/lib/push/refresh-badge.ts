import { loadAppBadgeCount } from "@/lib/push/badge-query";
import { setAppBadgeCount } from "@/lib/push/badge";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export async function refreshAppBadgeBestEffort(userId: string | null | undefined): Promise<void> {
  const uid = String(userId ?? "").trim();
  try {
    if (!uid) {
      await setAppBadgeCount(0);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      await setAppBadgeCount(0);
      return;
    }
    const count = await loadAppBadgeCount(supabase, uid);
    await setAppBadgeCount(count);
  } catch {
    /* badge is best-effort */
  }
}
