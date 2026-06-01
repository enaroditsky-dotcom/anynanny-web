import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

type MainLayoutProps = {
  children: ReactNode;
  /** Optional class names for the scrollable main region. */
  mainClassName?: string;
};

export function MainLayout({ children, mainClassName }: MainLayoutProps) {
  return (
    <div className="mx-auto flex h-[100dvh] w-full min-w-0 max-w-md flex-col overflow-hidden bg-[#FDFBF6] md:my-4 md:h-[calc(100dvh-2rem)] md:rounded-[2rem] md:shadow-soft">
      <header className="flex h-14 shrink-0 items-center bg-white px-4 shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
        <Link
          href="/"
          className="inline-flex min-w-0 items-center gap-2.5 transition hover:opacity-90 active:opacity-80"
          aria-label="AnyNanny — דף הבית"
        >
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full" aria-hidden>
            <Image
              src="/logo_clean.png"
              alt=""
              fill
              className="object-cover object-center"
              sizes="48px"
              priority
            />
          </div>

          <h1 className="truncate text-lg font-bold leading-none tracking-tight">
            <span className="text-slate-800">Any</span>
            <span className="text-rose-400">Nanny</span>
          </h1>
        </Link>
      </header>

      <main
        className={`min-h-0 flex-1 overflow-y-auto px-4 py-3 pb-[max(4rem,calc(4rem+env(safe-area-inset-bottom,0px)))] ${mainClassName ?? ""}`.trim()}
      >
        {children}
      </main>
    </div>
  );
}
