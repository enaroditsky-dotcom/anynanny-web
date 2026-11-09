import { Heebo } from "next/font/google";

/**
 * Heebo for the marketing sidebar only.
 * Apply `className` and `variable` on the sidebar root — do not attach to <html> or <body>.
 */
export const sidebarHeebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "700", "800"],
  display: "swap",
  variable: "--font-sidebar-heebo",
  fallback: ["Arial", "sans-serif"]
});
