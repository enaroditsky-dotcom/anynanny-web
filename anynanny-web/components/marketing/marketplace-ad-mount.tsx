import type { ReactNode } from "react";
import { MarketplaceSponsoredAdSlot } from "@/components/marketing/ad-surface-slots";

/**
 * Mount for a future AnyNanny Marketplace surface.
 * Keep this out of booking, search-to-book, checkout, and payment flows.
 */
export function MarketplaceAdMount({ children }: { children?: ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-md" aria-label="AnyNanny Marketplace">
      {children}
      <MarketplaceSponsoredAdSlot />
    </section>
  );
}
