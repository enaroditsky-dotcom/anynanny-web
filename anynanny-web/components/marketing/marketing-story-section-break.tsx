import type { ReactNode } from "react";
import { MarketingStoryInterstitialAdSlot } from "@/components/marketing/ad-surface-slots";

/**
 * In-flow break between marketing story sections.
 * Never use this as a popup, autoplay unit, or full-screen overlay.
 */
export function MarketingStorySectionBreak({ children }: { children?: ReactNode }) {
  return (
    <div className="w-full">
      {children}
      <MarketingStoryInterstitialAdSlot />
    </div>
  );
}
