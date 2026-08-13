"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SessionRoleBoundary } from "@/context/SessionContext";
import { getSitterOnboardingGateRedirect } from "@/lib/auth/post-auth-destination";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";

function SitterOnboardingGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAllowed(false);

    void (async () => {
      const auth = await resolveBrowserAuth();
      if (!auth.ok) {
        if (!cancelled) setAllowed(true);
        return;
      }

      const dest = await getSitterOnboardingGateRedirect(auth.supabase, auth.userId, pathname);
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
  }, [pathname, router]);

  if (!allowed) {
    return (
      <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center px-4 py-10" dir="rtl">
        <p className="text-center text-sm text-slate-600">טוענים…</p>
      </main>
    );
  }

  return <>{children}</>;
}

export default function SitterLayout({ children }: { children: ReactNode }) {
  return (
    <SessionRoleBoundary role="sitter">
      <SitterOnboardingGate>{children}</SitterOnboardingGate>
    </SessionRoleBoundary>
  );
}
