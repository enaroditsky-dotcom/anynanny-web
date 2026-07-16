"use client";

import type { ReactNode } from "react";
import { memo } from "react";
import { usePathname } from "next/navigation";
import { AppShellHeader } from "@/components/app-shell-header";
import { AppShellSessionHydration } from "@/components/app-shell-session-hydration";
import { AppShellStableBoundary } from "@/components/app-shell-stable-boundary";
import { BottomNav } from "@/components/bottom-nav";
import { RouteTransitionShell } from "@/components/route-transition-shell";
import SessionProvider from "@/context/SessionContext";

const CHROMELESS_PREFIXES = ["/auth/role-selection", "/auth/login", "/auth/sign-up", "/terms"];
const FIXED_VIEWPORT_PREFIXES = ["/parent/dashboard", "/parent/calendar", "/sitter/dashboard", "/sitter/shifts", "/session"];
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

const SHELL_BOTTOM_NAV_PADDING = "pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]";

/** Keep BottomNav identity stable across chrome layout swaps so wallet/chat realtime effects do not remount. */
const StableBottomNav = memo(BottomNav);

export function AppShellGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const chromeless = isChromelessAuthPath(pathname);

  if (chromeless) {
    return (
      <div className="mx-auto flex h-screen w-full min-w-0 max-w-md flex-col overflow-hidden bg-[#FDFBF6] md:my-4 md:rounded-[2rem] md:h-[calc(100dvh-2rem)]">
        <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    );
  }

  const fixedViewport = isFixedViewportPath(pathname);
  const mainLayout = isMainLayoutPath(pathname);

  return (
    <SessionProvider>
      <AppShellSessionHydration />
      {/* Layout chrome may change with pathname; BottomNav stays mounted as a sibling. */}
      {mainLayout ? (
        <div className="mx-auto flex h-screen w-full min-w-0 max-w-md flex-col overflow-hidden md:my-4 md:rounded-[2rem] md:h-[calc(100dvh-2rem)]">
          <div className={`min-h-0 flex-1 overflow-hidden ${SHELL_BOTTOM_NAV_PADDING}`}>
            <AppShellStableBoundary>
              <RouteTransitionShell fill>{children}</RouteTransitionShell>
            </AppShellStableBoundary>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex h-screen w-full min-w-0 max-w-md flex-col overflow-hidden bg-white shadow-soft md:my-4 md:rounded-[2rem] md:h-[calc(100dvh-2rem)]">
          <AppShellHeader />
          <div
            className={`relative min-h-0 min-w-0 flex-1 px-4 pt-4 ${
              fixedViewport
                ? `overflow-hidden overscroll-none ${SHELL_BOTTOM_NAV_PADDING}`
                : `overflow-y-auto ${SHELL_BOTTOM_NAV_PADDING}`
            }`}
          >
            <AppShellStableBoundary>
              <RouteTransitionShell fill={fixedViewport}>{children}</RouteTransitionShell>
            </AppShellStableBoundary>
          </div>
        </div>
      )}
      <StableBottomNav />
    </SessionProvider>
  );
}
