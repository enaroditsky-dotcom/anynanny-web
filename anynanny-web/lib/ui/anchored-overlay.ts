import { useLayoutEffect, useState, type RefObject } from "react";

export type AnchoredOverlayBox = {
  left: number;
  width: number;
  maxHeight: number;
  placement: "below" | "above";
  top: number;
  bottom: number;
};

const VIEWPORT_MARGIN = 8;

/**
 * Place a floating panel in viewport coordinates, outside any card stacking
 * context. `getBoundingClientRect` is physical, so RTL only affects which
 * trigger edge the panel shares.
 */
export function measureAnchoredOverlay(
  trigger: HTMLElement,
  options: {
    width: "trigger" | number;
    align: "stretch" | "start" | "end";
    preferredMaxHeight: number;
    gap?: number;
  }
): AnchoredOverlayBox {
  const rect = trigger.getBoundingClientRect();
  const gap = options.gap ?? 4;
  const viewport = window.visualViewport;
  const offsetLeft = viewport?.offsetLeft ?? 0;
  const offsetTop = viewport?.offsetTop ?? 0;
  const visualWidth = viewport?.width ?? window.innerWidth;
  const visualHeight = viewport?.height ?? window.innerHeight;
  const width =
    options.width === "trigger"
      ? rect.width
      : Math.min(options.width, Math.max(0, visualWidth - VIEWPORT_MARGIN * 2));
  const direction = getComputedStyle(trigger).direction;
  let visualLeft = rect.left;
  if (options.align === "start") {
    visualLeft = direction === "rtl" ? rect.right - width : rect.left;
  } else if (options.align === "end") {
    visualLeft = direction === "rtl" ? rect.left : rect.right - width;
  }
  const minLeft = VIEWPORT_MARGIN;
  const maxLeft = visualWidth - width - VIEWPORT_MARGIN;
  visualLeft = Math.min(Math.max(visualLeft, minLeft), Math.max(minLeft, maxLeft));

  const spaceBelow = visualHeight - rect.bottom - gap - VIEWPORT_MARGIN;
  const spaceAbove = rect.top - gap - VIEWPORT_MARGIN;
  const placement: "below" | "above" =
    spaceBelow >= Math.min(options.preferredMaxHeight, 160) || spaceBelow >= spaceAbove
      ? "below"
      : "above";
  const available = placement === "below" ? spaceBelow : spaceAbove;
  const maxHeight = Math.max(120, Math.min(options.preferredMaxHeight, Math.max(available, 120)));
  const triggerTop = rect.top + offsetTop;

  return {
    left: visualLeft + offsetLeft,
    width,
    maxHeight,
    placement,
    top: rect.bottom + gap + offsetTop,
    bottom: window.innerHeight - triggerTop + gap
  };
}

export function useAnchoredOverlay(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  width: "trigger" | number,
  align: "stretch" | "start" | "end",
  preferredMaxHeight: number
): AnchoredOverlayBox | null {
  const [box, setBox] = useState<AnchoredOverlayBox | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      setBox(measureAnchoredOverlay(trigger, { width, align, preferredMaxHeight }));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [align, open, preferredMaxHeight, triggerRef, width]);

  return box;
}
