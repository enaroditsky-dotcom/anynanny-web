"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getParentOnboardingGateRedirect,
  getSitterOnboardingGateRedirect,
  isSitterOnboardingPath
} from "@/lib/auth/post-auth-destination";
import {
  isParentOnboardingPath,
  isSecondRoleOnboardingAllowed,
  loadProductProfileOwnership,
  roleMismatchHref,
  type ProductProfileOwnership
} from "@/lib/auth/product-profiles";
import { AuthRetryStatus, useOnlineRetryNonce } from "@/lib/auth/use-online-retry-nonce";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";
import type { ProfileRole } from "@/lib/supabase/profiles";

function LoadingScreen() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center px-4 py-10" dir="rtl">
      <p className="text-center text-sm text-slate-600">טוענים…</p>
    </main>
  );
}

function ownsPortal(ownership: ProductProfileOwnership, portal: ProfileRole): boolean {
  return portal === "parent" ? ownership.hasParent : ownership.hasSitter;
}

export function ProductPortalGate({
  portal,
  children
}: {
  portal: ProfileRole;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const authRetry = useOnlineRetryNonce();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAllowed(false);

    void (async () => {
      const auth = await resolveBrowserAuth();
      if (cancelled) return;
      if (!auth.ok) {
        if (auth.reason === "unavailable") {
          authRetry.noteUnavailable();
          return;
        }
        authRetry.noteSettled();
        if (!cancelled) setAllowed(true);
        return;
      }
      authRetry.noteSettled();

      const ownership = await loadProductProfileOwnership(auth.supabase, auth.userId);
      if (cancelled) return;

      const onboardingPath =
        portal === "sitter" ? isSitterOnboardingPath(pathname) : isParentOnboardingPath(pathname);

      if (!ownership || !ownsPortal(ownership, portal)) {
        if (onboardingPath && isSecondRoleOnboardingAllowed(auth.userId, portal)) {
          if (!cancelled) setAllowed(true);
          return;
        }
        router.replace(roleMismatchHref(portal));
        return;
      }

      const dest =
        portal === "sitter"
          ? await getSitterOnboardingGateRedirect(auth.supabase, auth.userId, pathname)
          : await getParentOnboardingGateRedirect(auth.supabase, auth.userId, pathname);

      if (cancelled) return;

      if (dest && dest !== pathname) {
        router.replace(dest);
        return;
      }

      setAllowed(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [authRetry.nonce, authRetry.noteSettled, authRetry.noteUnavailable, pathname, portal, router]);

  if (!allowed) {
    if (authRetry.exhausted) {
      return (
        <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center px-4 py-10" dir="rtl">
          <AuthRetryStatus exhausted onRetry={() => authRetry.retryNow()} />
        </main>
      );
    }
    return <LoadingScreen />;
  }

  return <>{children}</>;
}
