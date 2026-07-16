"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { BottomNav } from "@/components/bottom-nav";

type MainLayoutProps = {
  children: ReactNode;
  mainClassName?: string;
};

export function MainLayout({ children, mainClassName }: MainLayoutProps) {
  return (
    <div className="mx-auto flex h-[100dvh] w-full min-w-0 max-w-md flex-col overflow-hidden bg-[#FDFBF6] md:my-4 md:h-[calc(100dvh-2rem)] md:rounded-[2rem] md:shadow-soft">
      <header className="relative flex h-14 shrink-0 items-center justify-center bg-white px-4 shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
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

      <main
        className={`min-h-0 flex-1 overflow-y-auto px-4 py-3 pb-[max(4rem,calc(4rem+env(safe-area-inset-bottom,0px)))] ${mainClassName ?? ""}`.trim()}
      >
        {children}
      </main>

      {/* כאן הניווט יופיע תמיד */}
      <BottomNav />
    </div>
  );
}