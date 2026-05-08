import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Assistant } from "next/font/google";
import { RoleSwitcher } from "@/components/role-switcher";

const assistant = Assistant({ subsets: ["hebrew", "latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "AnyNanny",
  description: "Babysitting marketplace for parents and sitters."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he">
      <body className={assistant.className}>
        <header className="sticky top-0 z-40 border-b border-brand-mint bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
            <Link
              href="/?manual=true"
              className="group inline-flex cursor-pointer items-center gap-3 rounded-full px-2 py-1 transition hover:bg-brand-mint/25"
              aria-label="Home"
            >
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-brand-mint/40 md:h-11 md:w-11">
                <Image src="/logo.png" alt="AnyNanny" width={44} height={44} className="h-full w-full object-cover object-center" priority />
              </div>
              <div className="text-2xl font-bold tracking-[0.2em] text-navy-header">ANYNANNY</div>
              <span className="rounded-full border border-navy-header/20 p-1 text-navy-header transition group-hover:border-navy-header/40" aria-hidden>
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 10.5 12 3l9 7.5" />
                  <path d="M5.5 9.5V20h13V9.5" />
                </svg>
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <RoleSwitcher />
              <div className="rounded-full bg-brand-mint px-3 py-1 text-xs text-navy-800">ביטחון • פשטות • פרטיות</div>
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
