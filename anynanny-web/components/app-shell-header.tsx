"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { AnyNannyAppLogo } from "@/components/brand/anynanny-app-logo";

export function AppShellHeader() {
  const { isLoading } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  /** מניעת הידרציה שגויה מול השרת */
  const showUi = mounted && !isLoading;

  return (
    <header className="z-40 w-full shrink-0 border-b border-navy-header/10 bg-white pt-[env(safe-area-inset-top,0px)] shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
      <div className="flex h-[5.2rem] items-center justify-center px-2" dir="rtl">
        {showUi ? (
          <AnyNannyAppLogo variant="shell" />
        ) : (
          <div
            className="w-[14.3375rem] max-w-[calc(100vw-1.5rem)] animate-pulse rounded bg-slate-100"
            style={{ aspectRatio: "2172 / 724" }}
          />
        )}
      </div>
    </header>
  );
}
