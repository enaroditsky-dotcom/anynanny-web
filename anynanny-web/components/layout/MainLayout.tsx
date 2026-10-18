"use client";

import type { ReactNode } from "react";
import { AnyNannyAppLogo } from "@/components/brand/anynanny-app-logo";

type MainLayoutProps = {
  children: ReactNode;
  mainClassName?: string;
  /** Inner brand header. App chrome already renders AppShellHeader — hide this to avoid a duplicate. */
  showBrandHeader?: boolean;
};

export function MainLayout({
  children,
  mainClassName,
  showBrandHeader = true
}: MainLayoutProps) {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-md flex-col bg-[#FDFBF6] md:rounded-[2rem] md:shadow-soft">
      {showBrandHeader ? (
        <header className="relative sticky top-0 z-20 flex h-[9rem] shrink-0 items-center justify-center bg-white px-4 shadow-[0_4px_16px_rgba(15,23,42,0.06)] sm:h-[9.7rem]">
          <h1 className="flex min-w-0 items-center justify-center">
            <AnyNannyAppLogo variant="header" />
          </h1>
        </header>
      ) : null}

      {/* Breathing room only — app shell already clears the fixed BottomNav. */}
      <main
        className={`px-4 ${showBrandHeader ? "py-3" : "pt-1"} pb-4 ${mainClassName ?? ""}`.trim()}
      >
        {children}
      </main>
    </div>
  );
}
