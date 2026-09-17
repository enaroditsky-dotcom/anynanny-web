import type { ReactNode } from "react";
import {
  KnowledgeArticleBottomAdSlot,
  KnowledgeArticleInlineAdSlot
} from "@/components/marketing/ad-surface-slots";

export { KnowledgeArticleInlineAdSlot, KnowledgeArticleBottomAdSlot };

/**
 * Layout helper for future public knowledge / article pages.
 * Drop `KnowledgeArticleInlineAdSlot` inside article copy when an in-body
 * break is wanted. The bottom slot stays at the end of the page.
 *
 * Slots render nothing while advertising remains disabled.
 */
export function KnowledgeArticleShell({ children }: { children: ReactNode }) {
  return (
    <article className="mx-auto w-full max-w-md text-right" dir="rtl">
      {children}
      <KnowledgeArticleBottomAdSlot />
    </article>
  );
}
