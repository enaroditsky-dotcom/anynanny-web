"use client";

import { useEffect, useLayoutEffect, useRef, type CSSProperties, type TransitionEvent } from "react";
import { AppSideDrawerLogout } from "@/components/navigation/app-side-drawer-logout";
import { AppSideDrawerMenu } from "@/components/navigation/app-side-drawer-menu";
import {
  APP_SIDE_DRAWER_BACKDROP,
  APP_SIDE_DRAWER_BOTTOM,
  APP_SIDE_DRAWER_ID,
  APP_SIDE_DRAWER_TOP,
  APP_SIDE_DRAWER_WIDTH,
  type DrawerPanelStyle,
  type DrawerPhase
} from "@/lib/navigation/app-side-drawer";
import {
  readDrawerTourPresentationHold,
  type AppDrawerRole
} from "@/lib/navigation/app-side-drawer-destinations";

const DESCRIPTION_ID = "app-side-drawer-description";
const DRAWER_WALLPAPER_SRC =
  "/brand/" + encodeURIComponent("טפט תינוקות ירוק פסטלי doodle.png");

function focusableElements(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  return Array.from(nodes).filter((el) => el.tabIndex >= 0 && !el.hasAttribute("disabled") && !el.closest("[hidden]"));
}

type AppSideDrawerProps = {
  phase: DrawerPhase;
  onClose: () => void;
  panelStyle?: DrawerPanelStyle;
  onTransitionEnd: (event: TransitionEvent<HTMLElement>) => void;
  navigationRole?: AppDrawerRole;
  navigationPath?: string;
};

/** Right-edge overlay. The header stays fixed; this panel covers the page below it. */
export function AppSideDrawer({
  phase,
  onClose,
  panelStyle,
  onTransitionEnd,
  navigationRole,
  navigationPath
}: AppSideDrawerProps) {
  const rootRef = useRef<HTMLElement>(null);
  const active = phase !== "closed";

  useLayoutEffect(() => {
    if (phase !== "opening") return;
    rootRef.current?.getBoundingClientRect();
  }, [phase]);

  useEffect(() => {
    if (phase !== "open") return;
    if (readDrawerTourPresentationHold()) return;
    const frame = requestAnimationFrame(() => {
      const root = rootRef.current;
      if (!root) return;
      const first = focusableElements(root)[0];
      (first ?? root).focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (!active) return;
    const root = rootRef.current;
    if (!root) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      if (readDrawerTourPresentationHold()) return;
      const items = focusableElements(root);
      if (items.length === 0) {
        event.preventDefault();
        root.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (!(current instanceof HTMLElement) || !root.contains(current)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
        return;
      }
      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [active]);

  return (
    <aside
      ref={rootRef}
      id={APP_SIDE_DRAWER_ID}
      role="dialog"
      aria-modal={active}
      aria-hidden={active ? undefined : true}
      aria-label="תפריט"
      aria-describedby={DESCRIPTION_ID}
      dir="rtl"
      tabIndex={-1}
      hidden={active ? undefined : true}
      className={[
        "absolute bottom-0 right-0 z-[70] min-h-0 flex-col overflow-hidden border-l border-[#001F3F]/10 bg-[#F7FBF4] shadow-[-12px_0_32px_rgba(15,23,42,0.12)] outline-none",
        active ? "flex" : "hidden"
      ].join(" ")}
      style={{
        top: APP_SIDE_DRAWER_TOP,
        bottom: 0,
        width: APP_SIDE_DRAWER_WIDTH,
        touchAction: "pan-y",
        overscrollBehavior: "contain",
        ...panelStyle
      }}
      onTransitionEnd={onTransitionEnd}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(rgba(253, 251, 246, 0.16), rgba(253, 251, 246, 0.28)), url("${DRAWER_WALLPAPER_SRC}")`,
          backgroundRepeat: "no-repeat, repeat",
          backgroundPosition: "center, center top",
          backgroundSize: "100% 100%, 100% auto"
        }}
      />
      <p id={DESCRIPTION_ID} className="sr-only">
        אזור אישי, הגדרות, אתר AnyNanny, ושירותים שיופיעו בקרוב.
      </p>
      <div
        className="relative z-[1] flex min-h-0 flex-1 flex-col"
        style={{ paddingBottom: APP_SIDE_DRAWER_BOTTOM }}
      >
        <AppSideDrawerMenu role={navigationRole} pathname={navigationPath} onNavigate={onClose} />
        <div data-app-drawer-footer="" className="shrink-0">
          <AppSideDrawerLogout />
        </div>
      </div>
    </aside>
  );
}

/** Dims the page below the header. Not a navigation control and not a modal. */
export function AppSideDrawerCatcher({
  onClose,
  motionStyle
}: {
  onClose: () => void;
  motionStyle?: CSSProperties;
}) {
  const backdropStyle: CSSProperties = {
    top: APP_SIDE_DRAWER_TOP,
    bottom: APP_SIDE_DRAWER_BOTTOM,
    background: APP_SIDE_DRAWER_BACKDROP,
    touchAction: "none",
    ...motionStyle
  };

  return (
    <button
      type="button"
      tabIndex={-1}
      data-app-side-drawer-backdrop=""
      aria-label="סגירת תפריט"
      className="absolute bottom-0 left-0 right-0 z-[60] cursor-pointer border-0 p-0"
      style={backdropStyle}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClose}
    />
  );
}
