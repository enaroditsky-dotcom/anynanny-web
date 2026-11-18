import type { Metadata } from "next";
import { TermsPageView } from "@/components/legal/terms-page-view";
import { absoluteSiteUrl } from "@/lib/seo/public-sitemap";

export const metadata: Metadata = {
  title: "תנאי שימוש | AnyNanny",
  description: "תנאי השימוש של פלטפורמת AnyNanny — מקשרת בין הורים לבייביסיטרים. עדכון אחרון: אוגוסט 2026.",
  alternates: {
    canonical: absoluteSiteUrl("/terms")
  }
};

export default function TermsPage() {
  return <TermsPageView />;
}
