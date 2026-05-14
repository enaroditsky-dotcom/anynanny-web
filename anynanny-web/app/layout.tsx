import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Assistant } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import { AppShellHeader } from "@/components/app-shell-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { RouteTransitionShell } from "@/components/route-transition-shell";

const assistant = Assistant({ subsets: ["hebrew", "latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "AnyNanny",
  description: "Babysitting marketplace for parents and sitters."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" suppressHydrationWarning>
      <body className={`${assistant.className} bg-[#FDFBF6]`} suppressHydrationWarning>
        <AuthProvider>
          <div className="mx-auto flex min-h-0 w-full min-w-0 max-w-md flex-col overflow-hidden bg-white shadow-soft md:my-4 md:min-h-[calc(100dvh-2rem)] md:rounded-[2rem]">
            <AppShellHeader />
            <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-28 pt-4">
              <RouteTransitionShell>{children}</RouteTransitionShell>
            </div>
            <BottomNavigation />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
