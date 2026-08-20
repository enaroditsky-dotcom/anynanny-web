"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { ANYNANNY_PUSH_NAVIGATE_MESSAGE } from "@/lib/push/constants";
import { loadAppBadgeCount } from "@/lib/push/badge-query";
import { setAppBadgeCount } from "@/lib/push/badge";
import { loadNotificationPreferencesForUser } from "@/lib/push/preferences";
import { reconcilePushSubscription } from "@/lib/push/register-push";
import { registerAnyNannyServiceWorker } from "@/lib/push/service-worker-register";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

async function refreshBadge(userId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    await setAppBadgeCount(0);
    return;
  }
  const count = await loadAppBadgeCount(supabase, userId);
  await setAppBadgeCount(count);
}

export function PushRuntime() {
  const { signedIn, user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const sync = useCallback(async () => {
    await registerAnyNannyServiceWorker();
    if (!signedIn || !user?.id) {
      await setAppBadgeCount(0);
      return;
    }
    const prefs = await loadNotificationPreferencesForUser(user.id);
    await reconcilePushSubscription(prefs.pushEnabled);
    await refreshBadge(user.id);
  }, [signedIn, user?.id]);

  useEffect(() => {
    if (isLoading) return;
    void sync();
  }, [isLoading, sync, pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    const onFocus = () => {
      void sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [sync]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== ANYNANNY_PUSH_NAVIGATE_MESSAGE) return;
      const url = String(data.url ?? "").trim();
      if (!url.startsWith("/")) return;
      router.push(url);
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, [router]);

  return null;
}
