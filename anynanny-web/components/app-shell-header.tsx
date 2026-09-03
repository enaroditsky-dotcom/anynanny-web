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
    <header className="w-full shrink-0 border-b border-navy-header/10 bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/80">
      <div className="flex h-[7.75rem] items-center justify-center px-4" dir="rtl">
        {showUi ? (
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-navy-header/20 bg-white shadow-sm">
              <img
                src="/anynanny-clean-transparent.png.jpg"
                alt=""
                aria-hidden
                className="h-full w-full object-contain p-1"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/anynanny_clean.jpg";
                }}
              />
            </div>

            <AnyNannyLogo variant="header" />
          </div>
        ) : (
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="h-16 w-16 animate-pulse rounded-full bg-slate-100" />
            <div className="h-[6.73rem] w-[15.97rem] animate-pulse rounded bg-slate-100 sm:h-[7.41rem] sm:w-[17.58rem]" />
          </div>
        )}
      </div>
    </header>
  );
}
