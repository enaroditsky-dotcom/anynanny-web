"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { AnyNannyLogo } from "@/components/brand/anynanny-logo";
import { APP_CONTENT_MAX_W } from "@/lib/ui/app-shell";

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
    <div className={`mx-auto flex w-full min-w-0 ${APP_CONTENT_MAX_W} flex-col bg-[#FDFBF6] md:rounded-2xl md:shadow-soft`}>
      {showBrandHeader ? (
        <header className="relative sticky top-0 z-20 flex h-12 shrink-0 items-center justify-center bg-white px-2 shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
          <div className="flex min-w-0 flex-row-reverse items-center gap-1">
            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-slate-100">
              <Image
                src="/anynanny_clean.jpg"
                alt=""
                fill
                aria-hidden
                className="object-cover object-center"
                sizes="32px"
                priority
              />
            </div>
            <h1 className="flex min-w-0 items-center">
              <AnyNannyLogo variant="header" />
            </h1>
          </div>
        </header>
      ) : null}

      {/* Breathing room only — app shell already clears the fixed BottomNav. */}
      <main
        className={`px-2 ${showBrandHeader ? "py-1.5" : "pt-1"} pb-2 ${mainClassName ?? ""}`.trim()}
      >
        {children}
      </main>
    </div>
  );
}
