"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { AnyNannyLogo } from "@/components/brand/anynanny-logo";

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
      <div className="flex h-12 items-center justify-center px-2" dir="rtl">
        {showUi ? (
          <div className="flex min-w-0 items-center gap-1">
            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-navy-header/20 bg-white shadow-sm">
              <img
                src="/anynanny-clean-transparent.png.jpg"
                alt=""
                aria-hidden
                className="h-full w-full object-contain p-0.5"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/anynanny_clean.jpg";
                }}
              />
            </div>

            <AnyNannyLogo variant="header" />
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <div className="h-8 w-8 animate-pulse rounded-full bg-slate-100" />
            <div className="h-7 w-[6.85rem] animate-pulse rounded bg-slate-100" />
          </div>
        )}
      </div>
    </header>
  );
}
