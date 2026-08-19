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
  description: "Babysitting marketplace for parents and sitters.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  appleWebApp: {
    title: "AnyNanny"
  }
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
