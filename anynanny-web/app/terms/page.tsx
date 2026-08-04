import type { Metadata } from "next";
import { TermsPageView } from "@/components/legal/terms-page-view";

export const metadata: Metadata = {
  title: "תנאי שימוש | AnyNanny",
  description: "תנאי השימוש של פלטפורמת AnyNanny — מקשרת בין הורים לבייביסיטרים."
};

export default function TermsPage() {
  return <TermsPageView />;
}
