"use client";

import type { ReactNode } from "react";
import { memo } from "react";
import { usePathname } from "next/navigation";

import { AppShellHeader } from "@/components/app-shell-header";
import { AppShellSessionHydration } from "@/components/app-shell-session-hydration";
import { AppShellStableBoundary } from "@/components/app-shell-stable-boundary";
import { BottomNav } from "@/components/bottom-nav";
import { ParentActiveNowDock } from "@/components/parent/parent-active-now-dock";
import { PushPermissionBanner } from "@/components/push/push-permission-banner";
import { PushRuntime } from "@/components/push/push-runtime";
import { RouteTransitionShell } from "@/components/route-transition-shell";
import SessionProvider from "@/context/SessionContext";

const CHROMELESS_PREFIXES = [
  "/",
  "/auth/role-selection",
  "/auth/login",
  "/auth/sign-up",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/reset-password",
  "/login",
  "/register",
  "/terms",
  "/privacy",
  "/sitter/onboarding"
];

/**
 * Routes that historically used a fixed viewport.
 *
 * We keep this list for compatibility/future route-specific behavior,
 * but we no longer disable vertical scrolling for these pages.
 */
const FIXED_VIEWPORT_PREFIXES = [
  "/parent/dashboard",
  "/parent/calendar",
  "/sitter/dashboard",
  "/sitter/shifts",
  "/session"
];

const MAIN_LAYOUT_PREFIXES = [
  "/parent/search",
  "/parent/wallet",
  "/sitter/wallet"
];

export function isChromelessAuthPath(pathname: string): boolean {
  return CHROMELESS_PREFIXES.some(
    (p) =>
      pathname === p ||
      pathname.startsWith(`${p}/`)
  );
}

export function isFixedViewportPath(pathname: string): boolean {
  return FIXED_VIEWPORT_PREFIXES.some(
    (p) =>
      pathname === p ||
      pathname.startsWith(`${p}/`)
  );
}

export function isMainLayoutPath(pathname: string): boolean {
  return MAIN_LAYOUT_PREFIXES.some(
    (p) =>
      pathname === p ||
      pathname.startsWith(`${p}/`)
  );
}

/**
 * Keeps page content safely above the fixed BottomNav,
 * including iPhone / mobile safe-area inset.
 */
const SHELL_BOTTOM_NAV_PADDING =
  "pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]";

/**
 * Keep BottomNav identity stable across route/layout changes
 * so wallet/chat/realtime effects do not remount unnecessarily.
 */
const StableBottomNav = memo(BottomNav);
// Do not memo the dock — it must always re-render with the latest pathname
// so /parent/broadcast → dashboard minimize can show the compact bar.


export function AppShellGate({
  children
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  const chromeless = isChromelessAuthPath(pathname);

  /**
   * Auth / landing pages manage their own layout.
   */
  if (chromeless) {
    return (
      <SessionProvider>
        <AppShellSessionHydration />
        <PushRuntime />

        <RouteTransitionShell>
          {children}
        </RouteTransitionShell>
      </SessionProvider>
    );
  }

  const mainLayout = isMainLayoutPath(pathname);

  /**
   * Keep the route classification available.
   *
   * Important:
   * fixedViewport must NEVER mean overflow-hidden anymore.
   * Every normal application page must remain vertically scrollable
   * whenever its content exceeds the available mobile viewport.
   */
  const fixedViewport = isFixedViewportPath(pathname);

  return (
    <SessionProvider>
      <AppShellSessionHydration />
      <PushRuntime />

      <AppShellStableBoundary>
        {/*
         * Dynamic viewport height is safer on mobile browsers whose
         * address/tool bars expand and collapse.
         *
         * min-h-0 is important for nested flex children so their
         * overflow-y-auto containers are actually allowed to shrink
         * and scroll.
         */}
        <div className="flex min-h-dvh min-w-0 flex-col bg-[#FDFBF6]">
          <AppShellHeader />

          {/*
           * BottomNav remains mounted as a sibling of the page content.
           * All page content gets bottom padding so its last controls
           * are never hidden behind the fixed navigation.
           */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {mainLayout ? (
              <div
                className={[
                  "min-h-0",
                  "min-w-0",
                  "flex-1",
                  "overflow-x-hidden",
                  "overflow-y-auto",
                  "overscroll-y-contain",
                  SHELL_BOTTOM_NAV_PADDING
                ].join(" ")}
              >
                <RouteTransitionShell>
                  <PushPermissionBanner />
                  {children}
                </RouteTransitionShell>
              </div>
            ) : (
              <div
                className={[
                  "relative",
                  "min-h-0",
                  "min-w-0",
                  "flex-1",
                  "overflow-x-hidden",
                  "overflow-y-auto",
                  "overscroll-y-contain",
                  "px-4",
                  "pt-4",
                  SHELL_BOTTOM_NAV_PADDING,
                  fixedViewport
                    ? "touch-pan-y"
                    : ""
                ].join(" ")}
              >
                <RouteTransitionShell>
                  <PushPermissionBanner />
                  {children}
                </RouteTransitionShell>
              </div>
            )}
          </div>

          <ParentActiveNowDock pathname={pathname} />
          <StableBottomNav />
        </div>
      </AppShellStableBoundary>
    </SessionProvider>
  );
}