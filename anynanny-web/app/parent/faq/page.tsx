import type { Metadata } from "next";
import { FaqPageView } from "@/components/faq/faq-page-view";
import { FAQ_PAGE_SUBTITLE, FAQ_PAGE_TITLE } from "@/lib/faq/faq-items";

export const metadata: Metadata = {
  title: `${FAQ_PAGE_TITLE} | AnyNanny`,
  description: FAQ_PAGE_SUBTITLE
};

export default function ParentFaqPage() {
  return <FaqPageView backHref="/parent/settings" role="parent" />;
}
