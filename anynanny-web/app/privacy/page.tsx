import type { Metadata } from "next";
import { PrivacyPageView } from "@/components/legal/privacy-page-view";
import { absoluteSiteUrl } from "@/lib/seo/public-sitemap";

export const metadata: Metadata = {
  title: "מדיניות פרטיות | AnyNanny",
  description: "מדיניות הפרטיות של פלטפורמת AnyNanny. עדכון אחרון: אוגוסט 2026.",
  alternates: {
    canonical: absoluteSiteUrl("/privacy")
  }
};

export default function PrivacyPage() {
  return <PrivacyPageView />;
}
