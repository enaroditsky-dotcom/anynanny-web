"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppShellHeader } from "@/components/app-shell-header";
import { AppShellSessionHydration } from "@/components/app-shell-session-hydration";
import { AppShellStableBoundary } from "@/components/app-shell-stable-boundary";
import { BottomNavigation } from "@/components/bottom-navigation";
import { RouteTransitionShell } from "@/components/route-transition-shell";
import SessionProvider from "@/context/SessionContext";

const CHROMELESS_PREFIXES = ["/auth/role-selection", "/auth/login", "/auth/register"];

/**
 * Screens that must lock to the device viewport with no page scroll (Fixed Viewport).
 * For these routes the shell height is pinned to the dynamic viewport and the content
 * area stops scrolling — individual screens distribute space via flex and may opt-in to
 * a small internal scroll on a specific overflowing box.
 */
const FIXED_VIEWPORT_PREFIXES = [
  "/parent/dashboard",
  "/sitter/dashboard",
  "/sitter/shifts",
  "/session"
];

/** Routes that render `MainLayout` with its own unified header and viewport shell. */
const MAIN_LAYOUT_PREFIXES = ["/parent/search", "/parent/wallet"];

export function isChromelessAuthPath(pathname: string): boolean {
  return CHROMELESS_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isFixedViewportPath(pathname: string): boolean {
  return FIXED_VIEWPORT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isMainLayoutPath(pathname: string): boolean {
  return MAIN_LAYOUT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function AppShellGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const chromeless = isChromelessAuthPath(pathname);

  if (chromeless) {
    return (
      <div className="mx-auto flex min-h-dvh w-full min-w-0 max-w-md flex-col overflow-hidden bg-[#FDFBF6] md:my-4 md:min-h-[calc(100dvh-2rem)] md:rounded-[2rem]">
        <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    );
  }

  const fixedViewport = isFixedViewportPath(pathname);
  const mainLayout = isMainLayoutPath(pathname);

  return (
    <SessionProvider>
      <AppShellSessionHydration />
      {mainLayout ? (
        <>
          <AppShellStableBoundary>
            <RouteTransitionShell fill>{children}</RouteTransitionShell>
          </AppShellStableBoundary>
          <BottomNavigation />
        </>
      ) : (
        <div
          className={`mx-auto flex w-full min-w-0 max-w-md flex-col overflow-hidden bg-white shadow-soft md:my-4 md:rounded-[2rem] ${
            fixedViewport
              ? "h-[100dvh] md:h-[calc(100dvh-2rem)]"
              : "min-h-0 md:min-h-[calc(100dvh-2rem)]"
          }`}
        >
          <AppShellHeader />
          <div
            className={`relative min-h-0 min-w-0 flex-1 px-4 pb-28 pt-4 ${
              fixedViewport ? "flex flex-col overflow-hidden" : "overflow-y-auto"
            }`}
          >
            <AppShellStableBoundary>
              <RouteTransitionShell fill={fixedViewport}>{children}</RouteTransitionShell>
            </AppShellStableBoundary>
          </div>
          <BottomNavigation />
        </div>
      )}
    </SessionProvider>
  );
}
