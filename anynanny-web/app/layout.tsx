import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "AnyNanny",
  description: "Babysitting marketplace for parents and sitters."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="he">
      <body>{children}</body>
    </html>
  );
}
