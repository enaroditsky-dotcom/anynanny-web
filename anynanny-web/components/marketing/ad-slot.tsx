import type { ReactNode } from "react";
import {
  resolveAdSlotView,
  type AdPlacementId,
  type AdSlotVariant
} from "@/lib/marketing/ad-slots";

type AdSlotProps = {
  placement: AdPlacementId;
  variant?: AdSlotVariant;
  className?: string;
  /** First-party creative only. Never pass third-party ad markup or scripts. */
  children?: ReactNode;
};

/**
 * Reusable advertising mount. Disabled slots render nothing — no empty box,
 * no reserved height, no third-party requests.
 *
 * When a placement is enabled later, this component reserves its configured
 * height to limit layout shift and always labels the region as sponsored.
 */
export function AdSlot({ placement, variant, className = "", children }: AdSlotProps) {
  const view = resolveAdSlotView(placement, variant);

  if (!view.visible) {
    return null;
  }

  return (
    <aside
      className={`${view.maxWidthClass} mx-auto ${className}`.trim()}
      style={{ minHeight: view.minHeightPx }}
      aria-label={view.accessibilityLabel}
      data-ad-placement={placement}
      data-ad-variant={view.variant}
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {view.sponsoredLabel}
      </p>
      {children}
    </aside>
  );
}
