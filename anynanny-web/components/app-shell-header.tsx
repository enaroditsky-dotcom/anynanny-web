"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";

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
      <div className="flex h-20 items-center justify-center px-4" dir="rtl">
        {showUi ? (
          <div className="flex items-center gap-4">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-navy-header/20 bg-white shadow-sm">
              <img
                src="/anynanny-clean-transparent.png.jpg"
                alt="AnyNanny Logo"
                className="h-full w-full object-contain p-1"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/anynanny_clean.jpg";
                }}
              />
            </div>

            <span className="text-3xl font-black tracking-tight text-[#001F3F]">
              Any<span className="text-emerald-600">Nanny</span>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 animate-pulse rounded-full bg-slate-100" />
            <div className="h-8 w-36 animate-pulse rounded bg-slate-100" />
          </div>
        )}
      </div>
    </header>
  );
}
