import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Assistant } from "next/font/google";
import { AppShellHeader } from "@/components/app-shell-header";

const assistant = Assistant({ subsets: ["hebrew", "latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "AnyNanny",
  description: "Babysitting marketplace for parents and sitters."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he">
      <body className={`${assistant.className} bg-[#FDFBF6]`}>
        <div className="mx-auto flex min-h-0 w-full min-w-0 max-w-md flex-col overflow-x-hidden bg-white shadow-soft md:my-4 md:min-h-[calc(100dvh-2rem)] md:rounded-[2rem]">
          <AppShellHeader />
          <div className="min-w-0 px-4 pb-6 pt-4">{children}</div>
        </div>
      </body>
    </html>
  );
}
