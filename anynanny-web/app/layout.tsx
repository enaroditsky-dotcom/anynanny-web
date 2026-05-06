import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import { Assistant } from "next/font/google";

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
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-brand-mint/40 md:h-11 md:w-11">
                <Image src="/logo.png" alt="AnyNanny" width={44} height={44} className="h-full w-full object-cover object-center" priority />
              </div>
              <div className="text-2xl font-bold tracking-[0.2em] text-navy-900">ANYNANNY</div>
            </div>
            <div className="rounded-full bg-brand-mint px-3 py-1 text-xs text-navy-800">ביטחון • פשטות • פרטיות</div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
