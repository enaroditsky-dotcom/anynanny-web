"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type TransitionEvent } from "react";
import {
  APP_SIDE_DRAWER_ID,
  APP_SIDE_DRAWER_MS,
  drawerBackdropStyle,
  drawerPanelStyle,
  hasBlockingOverlay,
  nextDrawerPhase,
  type DrawerPanelStyle,
  type DrawerPhase
} from "@/lib/navigation/app-side-drawer";
import {
  APP_DRAWER_TOUR_OVERLAY_SELECTOR,
  APP_DRAWER_TOUR_STEP_ATTRIBUTE,
  readDrawerTourPresentationHold
} from "@/lib/navigation/app-side-drawer-destinations";
import { guardDrawerBackgroundClick } from "@/lib/navigation/app-side-drawer-guard";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  return reduced;
}

export function useAppSideDrawer(enabled: boolean, pathname: string) {
  const [phase, setPhase] = useState<DrawerPhase>("closed");
  const reducedMotion = usePrefersReducedMotion();
  const reducedRef = useRef(reducedMotion);
  const enabledRef = useRef(enabled);
  const restoreFocusRef = useRef(false);
  const tourHoldRef = useRef(false);
  const pathRef = useRef(pathname);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);

  reducedRef.current = reducedMotion;
  enabledRef.current = enabled;

  useLayoutEffect(() => {
    const pathChanged = pathRef.current !== pathname;
    pathRef.current = pathname;
    if (!enabled || pathChanged) {
      restoreFocusRef.current = false;
      setPhase((current) => (current === "closed" ? current : "closed"));
    }
  }, [enabled, pathname]);

  useEffect(() => {
    if (phase !== "opening") return;
    // Two frames: the off-screen transform must paint before the ease-out starts.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        setPhase((current) => nextDrawerPhase(current, "settle-open", reducedRef.current));
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "closing") return;
    const timer = window.setTimeout(() => {
      setPhase((current) => nextDrawerPhase(current, "settle-closed", reducedRef.current));
    }, APP_SIDE_DRAWER_MS + 80);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === "closed") return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (readDrawerTourPresentationHold()) return;
      if (hasBlockingOverlay(APP_SIDE_DRAWER_ID)) return;
      event.preventDefault();
      event.stopPropagation();
      restoreFocusRef.current = true;
      setPhase((current) => nextDrawerPhase(current, "close", reducedRef.current));
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [phase]);

  useEffect(() => {
    if (phase === "closed") return;

    const onBackgroundClick = (event: MouseEvent) => {
      guardDrawerBackgroundClick(event, readDrawerTourPresentationHold(), () => {
        restoreFocusRef.current = true;
        setPhase((current) => nextDrawerPhase(current, "close", reducedRef.current));
      });
    };

    window.addEventListener("click", onBackgroundClick, true);
    return () => window.removeEventListener("click", onBackgroundClick, true);
  }, [phase]);

  useEffect(() => {
    if (phase === "closed") return;
    const clip = clipRef.current;
    const touched = new Set<HTMLElement>();

    const release = () => {
      for (const el of touched) {
        if (el.getAttribute("data-app-drawer-inert") !== "true") continue;
        el.removeAttribute("inert");
        el.removeAttribute("data-app-drawer-inert");
      }
      touched.clear();
    };

    const sync = () => {
      const tourHold = readDrawerTourPresentationHold();
      if (hasBlockingOverlay(APP_SIDE_DRAWER_ID, tourHold ? APP_DRAWER_TOUR_OVERLAY_SELECTOR : undefined)) {
        restoreFocusRef.current = false;
        setPhase((current) => nextDrawerPhase(current, "force-closed", reducedRef.current));
        return;
      }
      if (!clip) return;
      for (const child of Array.from(document.body.children)) {
        if (!(child instanceof HTMLElement)) continue;
        if (child === clip || child.contains(clip)) continue;
        const tourOverlay =
          tourHold &&
          (child.matches(APP_DRAWER_TOUR_OVERLAY_SELECTOR) || Boolean(child.querySelector(APP_DRAWER_TOUR_OVERLAY_SELECTOR)));
        if (tourOverlay) {
          if (child.getAttribute("data-app-drawer-inert") === "true") {
            child.removeAttribute("inert");
            child.removeAttribute("data-app-drawer-inert");
            touched.delete(child);
          }
          continue;
        }
        if (touched.has(child) || child.hasAttribute("inert")) continue;
        child.setAttribute("inert", "");
        child.setAttribute("data-app-drawer-inert", "true");
        touched.add(child);
      }
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-modal", "open", "hidden", "role"]
    });

    return () => {
      observer.disconnect();
      release();
    };
  }, [phase]);

  useLayoutEffect(() => {
    if (phase !== "closed") return;
    if (!restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    menuButtonRef.current?.focus({ preventScroll: true });
  }, [phase]);

  useEffect(() => {
    if (!enabled) return;

    const syncTourPresentation = () => {
      const hold = readDrawerTourPresentationHold();
      const wasHolding = tourHoldRef.current;
      tourHoldRef.current = hold;
      if (hold) {
        restoreFocusRef.current = false;
        setPhase((current) => nextDrawerPhase(current, "open", reducedRef.current));
        return;
      }
      if (wasHolding) {
        restoreFocusRef.current = false;
        setPhase((current) => nextDrawerPhase(current, "close", reducedRef.current));
      }
    };

    syncTourPresentation();
    const observer = new MutationObserver(syncTourPresentation);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [APP_DRAWER_TOUR_STEP_ATTRIBUTE]
    });
    return () => {
      observer.disconnect();
      tourHoldRef.current = false;
    };
  }, [enabled]);

  const openDrawer = useCallback(() => {
    if (!enabledRef.current) return;
    if (hasBlockingOverlay(APP_SIDE_DRAWER_ID)) return;
    restoreFocusRef.current = true;
    setPhase((current) => nextDrawerPhase(current, "open", reducedRef.current));
  }, []);

  const toggleDrawer = useCallback(() => {
    if (!enabledRef.current) return;
    setPhase((current) => {
      const shown = current === "open" || current === "opening";
      if (shown) {
        if (readDrawerTourPresentationHold()) return current;
        restoreFocusRef.current = true;
        return nextDrawerPhase(current, "close", reducedRef.current);
      }
      if (hasBlockingOverlay(APP_SIDE_DRAWER_ID)) return current;
      restoreFocusRef.current = true;
      return nextDrawerPhase(current, "open", reducedRef.current);
    });
  }, []);

  const closeDrawer = useCallback(() => {
    if (readDrawerTourPresentationHold()) return;
    restoreFocusRef.current = true;
    setPhase((current) => nextDrawerPhase(current, "close", reducedRef.current));
  }, []);

  const onPanelTransitionEnd = useCallback((event: TransitionEvent<HTMLElement>) => {
    if (event.propertyName !== "transform") return;
    if (event.target !== event.currentTarget) return;
    setPhase((current) => nextDrawerPhase(current, "settle-closed", reducedRef.current));
  }, []);

  const panelStyle: DrawerPanelStyle | undefined = enabled ? drawerPanelStyle(phase, reducedMotion) : undefined;
  const backdropStyle = enabled ? drawerBackdropStyle(phase, reducedMotion) : undefined;

  return {
    enabled,
    phase,
    panelStyle,
    backdropStyle,
    clipRaised: enabled && phase !== "closed",
    openDrawer,
    toggleDrawer,
    closeDrawer,
    onPanelTransitionEnd,
    menuButtonRef,
    clipRef
  };
}
