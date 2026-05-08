import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Assistant } from "next/font/google";
import { Home, Mail } from "lucide-react";

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
          <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3 md:max-w-6xl md:px-6">
            <button
              type="button"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-navy-header shadow-sm transition hover:bg-brand-cream"
              aria-label="Messages"
            >
              <Mail className="h-5 w-5" />
              <span className="absolute right-2 top-1.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" aria-hidden />
            </button>

            <Link
              href="/?manual=true"
              className="inline-flex items-center gap-2 rounded-full bg-[#F5EEDC] px-3 py-1.5 text-navy-header shadow-sm transition hover:brightness-95"
              aria-label="Home"
            >
              <Home className="h-4 w-4" />
              <span className="relative h-7 w-7 overflow-hidden rounded-full ring-1 ring-navy-header/15">
                <Image src="/logo.png" alt="AnyNanny" fill className="object-cover object-center" priority />
              </span>
              <span className="text-lg font-bold">AnyNanny</span>
            </Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
