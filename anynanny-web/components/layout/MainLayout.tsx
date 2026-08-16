"use client";

import Image from "next/image";
import type { ReactNode } from "react";

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
        <header className="relative sticky top-0 z-20 flex h-14 shrink-0 items-center justify-center bg-white px-4 shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
          <div className="flex flex-row-reverse items-center gap-2.5">
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-slate-100">
              <Image
                src="/anynanny_clean.jpg"
                alt="AnyNanny Logo"
                fill
                className="object-cover object-center"
                sizes="44px"
                priority
              />
            </div>
            <h1 className="flex flex-row text-xl font-bold leading-none tracking-tight select-none">
              <span className="text-[#001F3F]">Any</span>
              <span className="text-[#00A86B]">Nanny</span>
            </h1>
          </div>
        </header>
      ) : null}

      {/* Bottom padding clears fixed BottomNav + elevated AnyNanny Now FAB */}
      <main
        className={`px-4 ${showBrandHeader ? "py-3" : "pt-1"} pb-[calc(8rem+var(--anynanny-now-dock,0px)+env(safe-area-inset-bottom,0px))] ${mainClassName ?? ""}`.trim()}
      >
        {children}
      </main>
    </div>
  );
}
