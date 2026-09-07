import type { ProductTourPlacement } from "@/lib/product-tour/types";

export const TOUR_TOOLTIP_MAX_WIDTH_PX = 320;
export const TOUR_TOOLTIP_MIN_WIDTH_PX = 280;
export const TOUR_TOOLTIP_GUTTER_PX = 12;
export const TOUR_TOOLTIP_GAP_PX = 12;

export type TourSpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  radius?: number;
};

export type TourTooltipBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function clampTourTooltipWidth(measuredWidth: number, viewportWidth: number): number {
  const maxByViewport = Math.max(0, viewportWidth - TOUR_TOOLTIP_GUTTER_PX * 2);
  const preferred = Math.min(TOUR_TOOLTIP_MAX_WIDTH_PX, Math.max(TOUR_TOOLTIP_MIN_WIDTH_PX, measuredWidth));
  return Math.min(preferred, maxByViewport);
}

export function tourTooltipOverlapsTarget(tooltip: TourTooltipBox, target: TourSpotlightRect, gap = 4): boolean {
  return (
    tooltip.left < target.left + target.width + gap &&
    tooltip.left + tooltip.width + gap > target.left &&
    tooltip.top < target.top + target.height + gap &&
    tooltip.top + tooltip.height + gap > target.top
  );
}

function clampLeft(left: number, width: number, viewportWidth: number): number {
  return Math.min(viewportWidth - width - TOUR_TOOLTIP_GUTTER_PX, Math.max(TOUR_TOOLTIP_GUTTER_PX, left));
}

function clampTop(top: number, height: number, viewportHeight: number): number {
  return Math.min(viewportHeight - height - TOUR_TOOLTIP_GUTTER_PX, Math.max(TOUR_TOOLTIP_GUTTER_PX, top));
}

function placementOrder(
  preferred: ProductTourPlacement,
  target: TourSpotlightRect,
  viewportHeight: number
): Array<"top" | "bottom" | "left" | "right"> {
  const auto = target.top > viewportHeight * 0.55 ? "top" : "bottom";
  const first = preferred === "auto" ? auto : preferred === "left" || preferred === "right" || preferred === "top" || preferred === "bottom" ? preferred : auto;
  const opposite = first === "top" ? "bottom" : first === "bottom" ? "top" : first === "left" ? "right" : "left";
  const rest = (["top", "bottom", "left", "right"] as const).filter((placement) => placement !== first && placement !== opposite);
  return [first, opposite, ...rest];
}

function candidateForPlacement(
  placement: ProductTourPlacement,
  target: TourSpotlightRect,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number
): TourTooltipBox {
  const centeredLeft = clampLeft(target.left + target.width / 2 - width / 2, width, viewportWidth);
  if (placement === "top") {
    return {
      top: clampTop(target.top - height - TOUR_TOOLTIP_GAP_PX, height, viewportHeight),
      left: centeredLeft,
      width,
      height
    };
  }
  if (placement === "bottom") {
    return {
      top: clampTop(target.top + target.height + TOUR_TOOLTIP_GAP_PX, height, viewportHeight),
      left: centeredLeft,
      width,
      height
    };
  }
  if (placement === "left") {
    return {
      top: clampTop(target.top, height, viewportHeight),
      left: clampLeft(target.left - width - TOUR_TOOLTIP_GAP_PX, width, viewportWidth),
      width,
      height
    };
  }
  return {
    top: clampTop(target.top, height, viewportHeight),
    left: clampLeft(target.left + target.width + TOUR_TOOLTIP_GAP_PX, width, viewportWidth),
    width,
    height
  };
}

function fitsViewport(box: TourTooltipBox, viewportWidth: number, viewportHeight: number): boolean {
  return (
    box.left >= TOUR_TOOLTIP_GUTTER_PX - 0.5 &&
    box.top >= TOUR_TOOLTIP_GUTTER_PX - 0.5 &&
    box.left + box.width <= viewportWidth - TOUR_TOOLTIP_GUTTER_PX + 0.5 &&
    box.top + box.height <= viewportHeight - TOUR_TOOLTIP_GUTTER_PX + 0.5
  );
}

export function positionTourTooltip(
  rect: TourSpotlightRect | null,
  placement: ProductTourPlacement | undefined,
  width: number,
  height: number,
  viewport: { width: number; height: number } = { width: 390, height: 844 }
): { top: number; left: number } {
  const vw = viewport.width;
  const vh = viewport.height;

  if (!rect) {
    return {
      top: Math.max(24, (vh - height) / 2),
      left: clampLeft((vw - width) / 2, width, vw)
    };
  }

  const preferred = placement && placement !== "auto" ? placement : "auto";
  const order = placementOrder(preferred, rect, vh);
  let fallback = candidateForPlacement(order[0] ?? "bottom", rect, width, height, vw, vh);

  for (const nextPlacement of order) {
    const candidate = candidateForPlacement(nextPlacement, rect, width, height, vw, vh);
    if (tourTooltipOverlapsTarget(candidate, rect)) continue;
    if (!fitsViewport(candidate, vw, vh)) continue;
    return { top: candidate.top, left: candidate.left };
  }

  for (const nextPlacement of order) {
    const candidate = candidateForPlacement(nextPlacement, rect, width, height, vw, vh);
    if (!tourTooltipOverlapsTarget(candidate, rect)) {
      fallback = candidate;
      break;
    }
  }

  return { top: fallback.top, left: fallback.left };
}
