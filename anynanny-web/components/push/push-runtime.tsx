"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { ANYNANNY_PUSH_NAVIGATE_MESSAGE } from "@/lib/push/constants";
import { clearAppBadge } from "@/lib/push/badge";
import { loadNotificationPreferencesForUser } from "@/lib/push/preferences";
import { reconcilePushSubscription } from "@/lib/push/register-push";
import { registerAnyNannyServiceWorker } from "@/lib/push/service-worker-register";

export function PushRuntime() {
  const { signedIn, user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const sync = useCallback(async () => {
    await registerAnyNannyServiceWorker();
    await clearAppBadge();
    if (!signedIn || !user?.id) return;
    const prefs = await loadNotificationPreferencesForUser(user.id);
    await reconcilePushSubscription(prefs.pushEnabled);
  }, [signedIn, user?.id]);

  useEffect(() => {
    void clearAppBadge();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    void sync();
  }, [isLoading, sync, pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void clearAppBadge();
      void sync();
    };
    const onFocus = () => {
      void clearAppBadge();
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
