"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PARENT_TOUR_COPY } from "@/lib/product-tour/constants";
import { matchesTourRoute } from "@/lib/product-tour/eligibility";
import { firstPresentTourSelector, tourStepSelectorList } from "@/lib/product-tour/resolve-target";
import {
  clampTourTooltipWidth,
  positionTourTooltip,
  TOUR_TOOLTIP_MAX_WIDTH_PX,
  type TourSpotlightRect
} from "@/lib/product-tour/tooltip-layout";
import type { ProductTourStep } from "@/lib/product-tour/types";

const SPOTLIGHT_PAD = 8;
const TARGET_WAIT_MS = 2800;

const TOUR_BTN_PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#001F3F] px-4 text-sm font-bold text-white transition hover:bg-[#003366] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#001F3F] focus-visible:ring-offset-2 disabled:opacity-60";
const TOUR_BTN_GHOST =
  "inline-flex min-h-11 items-center justify-center rounded-2xl px-3 text-sm font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 transition hover:text-[#001F3F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#001F3F] focus-visible:ring-offset-2";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function readRadius(el: HTMLElement): number {
  const raw = window.getComputedStyle(el).borderRadius;
  const first = Number.parseFloat(raw.split(" ")[0] ?? "16");
  return Number.isFinite(first) ? Math.min(24, Math.max(12, first)) : 16;
}

function paddedRect(el: HTMLElement): TourSpotlightRect {
  const box = el.getBoundingClientRect();
  return {
    top: Math.max(0, box.top - SPOTLIGHT_PAD),
    left: Math.max(0, box.left - SPOTLIGHT_PAD),
    width: Math.min(window.innerWidth, box.width + SPOTLIGHT_PAD * 2),
    height: Math.min(window.innerHeight, box.height + SPOTLIGHT_PAD * 2),
    radius: readRadius(el)
  };
}

function queryTourElement(selector: string): HTMLElement | null {
  const el = document.querySelector(selector);
  return el instanceof HTMLElement ? el : null;
}

function resolveTourTarget(step: ProductTourStep): HTMLElement | null {
  const selector = firstPresentTourSelector(tourStepSelectorList(step), (value) => Boolean(queryTourElement(value)));
  return selector ? queryTourElement(selector) : null;
}

export function ProductTourEngine({
  active,
  step,
  pathname,
  onNext,
  onSkip
}: {
  active: boolean;
  step: ProductTourStep | null;
  pathname: string;
  onNext: () => void;
  onSkip: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<TourSpotlightRect | null>(null);
  const [missing, setMissing] = useState(false);
  const [tooltipSize, setTooltipSize] = useState({ width: 300, height: 132 });
  const advanceLock = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const routeReady = useMemo(() => {
    if (!step) return false;
    return matchesTourRoute(pathname, step.route, Boolean(step.routeExact));
  }, [pathname, step]);

  const measure = useCallback(() => {
    if (!step) return;
    const selectors = tourStepSelectorList(step);
    if (selectors.length === 0) {
      setRect(null);
      setMissing(false);
      return;
    }
    const el = resolveTourTarget(step);
    if (el) {
      if (!el.closest("nav") && !prefersReducedMotion()) {
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      } else if (!el.closest("nav")) {
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
      }
      setRect(paddedRect(el));
      setMissing(false);
      return;
    }
    setRect(null);
  }, [step]);

  useEffect(() => {
    if (!active || !step) {
      setRect(null);
      setMissing(false);
      advanceLock.current = false;
      return;
    }

    advanceLock.current = false;
    setMissing(false);
    measure();

    const started = Date.now();
    const interval = window.setInterval(() => {
      measure();
      if (tourStepSelectorList(step).length === 0) {
        setMissing(false);
        window.clearInterval(interval);
        return;
      }
      if (resolveTourTarget(step)) return;
      const waitMs = routeReady ? TARGET_WAIT_MS : TARGET_WAIT_MS * 2;
      if (Date.now() - started >= waitMs) {
        setMissing(true);
        window.clearInterval(interval);
      }
    }, 120);

    const onWin = () => measure();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [active, step, pathname, measure, routeReady]);

  useEffect(() => {
    if (!active || !step || missing) return;
    const interceptClicks = step.advanceMode === "click-target" || step.blockTargetAction;
    if (!interceptClicks) return;
    const el = resolveTourTarget(step);
    if (!(el instanceof HTMLElement)) return;

    const onClick = (event: Event) => {
      if (step.preserveTargetState || step.blockTargetAction) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (step.advanceMode !== "click-target") return;
      if (advanceLock.current) return;
      advanceLock.current = true;
      onNext();
    };

    el.addEventListener("click", onClick, true);
    return () => el.removeEventListener("click", onClick, true);
  }, [active, step, missing, rect, onNext]);

  useEffect(() => {
    if (!active || !cardRef.current) return;
    const node = cardRef.current;
    const update = () => {
      const box = node.getBoundingClientRect();
      setTooltipSize({
        width: clampTourTooltipWidth(box.width, window.innerWidth),
        height: Math.max(box.height, 96)
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, [active, step, missing]);

  useEffect(() => {
    if (!active) return;
    const focusTimer = window.setTimeout(() => {
      nextRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(focusTimer);
  }, [active, step?.id]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active]);

  if (!mounted || !active || !step) return null;

  const showNext = step.advanceMode === "next-button" || missing || !step.targetSelector;
  const pos = positionTourTooltip(rect, step.placement, tooltipSize.width, tooltipSize.height, {
    width: typeof window === "undefined" ? 390 : window.innerWidth,
    height: typeof window === "undefined" ? 844 : window.innerHeight
  });
  const hole = rect && !missing ? rect : null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[160]" dir="rtl">
      {hole ? (
        <>
          <div className="pointer-events-auto absolute inset-x-0 top-0 bg-[#001F3F]/55" style={{ height: hole.top }} />
          <div
            className="pointer-events-auto absolute inset-x-0 bottom-0 bg-[#001F3F]/55"
            style={{ top: hole.top + hole.height }}
          />
          <div
            className="pointer-events-auto absolute bg-[#001F3F]/55"
            style={{ top: hole.top, left: 0, width: hole.left, height: hole.height }}
          />
          <div
            className="pointer-events-auto absolute bg-[#001F3F]/55"
            style={{
              top: hole.top,
              left: hole.left + hole.width,
              right: 0,
              height: hole.height
            }}
          />
          <div
            className="pointer-events-none absolute ring-2 ring-[#C5A059] ring-offset-2 ring-offset-transparent"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
              borderRadius: hole.radius
            }}
          />
          {step.blockTargetAction ? (
            <div
              className="pointer-events-auto absolute"
              style={{
                top: hole.top,
                left: hole.left,
                width: hole.width,
                height: hole.height
              }}
            />
          ) : null}
        </>
      ) : (
        <div className="pointer-events-auto absolute inset-0 bg-[#001F3F]/55" />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="pointer-events-auto absolute z-[161] w-[min(20rem,calc(100vw-1.5rem))] max-w-[320px] rounded-2xl border border-[#001F3F]/10 bg-white p-3 text-right shadow-xl"
        style={{ top: pos.top, left: pos.left, maxWidth: TOUR_TOOLTIP_MAX_WIDTH_PX }}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id={titleId} className="text-sm font-bold leading-snug text-[#001F3F]">
            {step.title}
          </h2>
          <button type="button" className={`${TOUR_BTN_GHOST} shrink-0 px-1 text-xs`} onClick={onSkip}>
            {PARENT_TOUR_COPY.skip}
          </button>
        </div>
        <p id={descId} className="mt-1.5 text-sm leading-snug text-slate-600">
          {step.description}
        </p>
        {missing ? (
          <p className="mt-1.5 text-xs leading-snug text-slate-500">{PARENT_TOUR_COPY.missingTarget}</p>
        ) : null}
        {showNext ? (
          <div className="mt-3 flex justify-start">
            <button ref={nextRef} type="button" className={TOUR_BTN_PRIMARY} onClick={onNext}>
              {PARENT_TOUR_COPY.next}
            </button>
          </div>
        ) : (
          <p className="mt-2 text-xs font-medium text-slate-500">לחצו על האזור המודגש כדי להמשיך.</p>
        )}
      </div>
    </div>,
    document.body
  );
}

export const PARENT_TOUR_PRIMARY_BUTTON_CLASS = TOUR_BTN_PRIMARY;
export const PARENT_TOUR_SECONDARY_BUTTON_CLASS =
  "inline-flex min-h-11 w-full items-center justify-center rounded-2xl border-2 border-[#001F3F]/15 bg-white px-4 text-sm font-bold text-[#001F3F] transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#001F3F] focus-visible:ring-offset-2";
export const PARENT_TOUR_PRIMARY_WIDE_BUTTON_CLASS = `${TOUR_BTN_PRIMARY} w-full`;
