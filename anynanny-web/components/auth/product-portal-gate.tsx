"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onboardingUnreadableHref } from "@/lib/auth/onboarding-state";
import {
  getParentOnboardingGateRedirect,
  getSitterOnboardingGateRedirect,
  isSitterOnboardingPath
} from "@/lib/auth/post-auth-destination";
import {
  classifyPortalAccess,
  isParentOnboardingPath,
  isSecondRoleOnboardingAllowed,
  readProductProfileOwnership,
  roleMismatchHref
} from "@/lib/auth/product-profiles";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";
import type { ProfileRole } from "@/lib/supabase/profiles";

function LoadingScreen() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center px-4 py-10" dir="rtl">
      <p className="text-center text-sm text-slate-600">טוענים…</p>
    </main>
  );
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
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAllowed(false);

    void (async () => {
      try {
        const auth = await resolveBrowserAuth();
        if (!auth.ok) {
          if (!cancelled) setAllowed(true);
          return;
        }

        const read = await readProductProfileOwnership(auth.supabase, auth.userId);
        if (cancelled) return;

        const access = classifyPortalAccess(read, portal);
        if (access === "unreadable") {
          router.replace(onboardingUnreadableHref(portal));
          return;
        }

        const onboardingPath =
          portal === "sitter" ? isSitterOnboardingPath(pathname) : isParentOnboardingPath(pathname);

        if (access === "unowned") {
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
      } catch {
        if (!cancelled) router.replace(onboardingUnreadableHref(portal));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, portal, router]);

  if (!allowed) return <LoadingScreen />;

  return <>{children}</>;
}
