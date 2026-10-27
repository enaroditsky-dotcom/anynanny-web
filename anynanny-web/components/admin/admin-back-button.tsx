"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { usePathname } from "next/navigation";
import { placeFloatingAdminBackButton } from "@/lib/admin/admin-floating-back";
import { appShellScrollElement } from "@/lib/ui/app-shell";

type Variant = "header" | "floating";

type Props = {
  onBack: () => void;
  variant?: Variant;
  focusable?: boolean;
  buttonRef?: RefObject<HTMLButtonElement | null>;
};

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-800";

export function AdminBackButton({ onBack, variant = "header", focusable = true, buttonRef }: Props) {
  const floating = variant === "floating";
  const pathname = usePathname();
  const innerRef = useRef<HTMLButtonElement>(null);
  const setButton = useCallback((node: HTMLButtonElement | null) => {
    innerRef.current = node;
    if (buttonRef) buttonRef.current = node;
  }, [buttonRef]);

  useLayoutEffect(() => {
    if (!floating) return;
    const node = innerRef.current;
    if (!node) return;
    const place = () => {
      const frame = readFloatingBackFrame(node);
      const next = placeFloatingAdminBackButton(frame);
      node.style.top = `${next.top}px`;
      node.style.left = `${next.left}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    const scrollRoot = appShellScrollElement();
    const main = adminContentElement(scrollRoot);
    if (scrollRoot) observer.observe(scrollRoot);
    if (main && main !== scrollRoot) observer.observe(main);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
    };
  }, [floating, pathname]);

  return (
    <button
      ref={setButton}
      type="button"
      dir="rtl"
      tabIndex={focusable ? 0 : -1}
      aria-hidden={focusable ? undefined : true}
      aria-label="חזור"
      className={
        floating
          ? `fixed z-40 inline-flex min-h-11 items-center gap-1 rounded-xl border border-navy-200 bg-navy-800 px-3 py-2 text-sm font-semibold text-white shadow-lg ${FOCUS_RING}`
          : `inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-navy-800 ${FOCUS_RING}`
      }
      onClick={onBack}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M7 4.5 12.5 10 7 15.5" />
      </svg>
      חזור
    </button>
  );
}

/** True while the header Back button intersects the admin scrollport. */
export function useAdminHeaderBackVisible(buttonRef: RefObject<HTMLButtonElement | null>): boolean {
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const node = buttonRef.current;
    if (!node) {
      setVisible(true);
      return;
    }
    const scrollRoot = appShellScrollElement();
    const root = scrollRoot && scrollRoot.contains(node) ? scrollRoot : null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const next = entry?.isIntersecting !== false;
        setVisible((current) => (current === next ? current : next));
      },
      { root, threshold: 0 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [buttonRef, pathname]);

  return visible;
}

function adminContentElement(scrollRoot: HTMLElement | null): HTMLElement | null {
  const main = scrollRoot?.querySelector("main") ?? document.querySelector("main");
  return main instanceof HTMLElement ? main : null;
}

function readSafeInsets(): { top: number; right: number; bottom: number; left: number } {
  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.paddingTop = "env(safe-area-inset-top)";
  probe.style.paddingRight = "env(safe-area-inset-right)";
  probe.style.paddingBottom = "env(safe-area-inset-bottom)";
  probe.style.paddingLeft = "env(safe-area-inset-left)";
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const insets = {
    top: Number.parseFloat(style.paddingTop) || 0,
    right: Number.parseFloat(style.paddingRight) || 0,
    bottom: Number.parseFloat(style.paddingBottom) || 0,
    left: Number.parseFloat(style.paddingLeft) || 0
  };
  probe.remove();
  return insets;
}

function readFloatingBackFrame(button: HTMLElement) {
  const viewport = window.visualViewport;
  const scrollRoot = appShellScrollElement();
  const main = adminContentElement(scrollRoot);
  const scrollRect = scrollRoot?.getBoundingClientRect();
  const mainRect = main?.getBoundingClientRect();
  const safe = readSafeInsets();
  return {
    viewportWidth: viewport?.width ?? window.innerWidth,
    viewportHeight: viewport?.height ?? window.innerHeight,
    safeLeft: safe.left,
    safeRight: safe.right,
    safeTop: safe.top,
    safeBottom: safe.bottom,
    contentViewportTop: scrollRect?.top ?? 0,
    contentLeft: mainRect?.left ?? (scrollRect ? scrollRect.left + 16 : 16),
    buttonWidth: button.offsetWidth || 96,
    buttonHeight: button.offsetHeight || 44
  };
}
