import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Varela_Round } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import { AppShellGate } from "@/components/app-shell-gate";

const varelaRound = Varela_Round({
  subsets: ["hebrew", "latin"],
  weight: "400",
  display: "swap",
  variable: "--font-varela-round",
  fallback: ["system-ui", "Segoe UI", "Arial", "sans-serif"]
});

export const metadata: Metadata = {
  title: "AnyNanny",
  description: "Babysitting marketplace for parents and sitters."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he" className={varelaRound.variable} suppressHydrationWarning>
      <body className={`${varelaRound.className} bg-[#FDFBF6] font-sans antialiased`} suppressHydrationWarning>
        <AuthProvider>
          <AppShellGate>{children}</AppShellGate>
        </AuthProvider>
      </body>
    </html>
  );
}
