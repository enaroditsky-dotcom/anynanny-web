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
      <div className="flex h-[5.25rem] items-center justify-center px-4 sm:h-[5.5rem]" dir="rtl">
        {showUi ? (
          <div className="flex min-w-0 items-center gap-1 sm:gap-1">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-navy-header/20 bg-white shadow-sm sm:h-[3.25rem] sm:w-[3.25rem]">
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
            <div className="h-12 w-12 animate-pulse rounded-full bg-slate-100 sm:h-[3.25rem] sm:w-[3.25rem]" />
            <div className="h-[4.89rem] w-[11.6rem] animate-pulse rounded bg-slate-100 sm:h-[5.31rem] sm:w-[12.6rem]" />
          </div>
        )}
      </div>
    </header>
  );
}
