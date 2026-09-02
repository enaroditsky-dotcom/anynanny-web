"use client";

import type { ReactNode } from "react";
import { memo } from "react";
import { usePathname } from "next/navigation";

import { AppShellHeader } from "@/components/app-shell-header";
import { GlobalCoordinationNotifications } from "@/components/notifications/global-coordination-notifications";
import { AppShellSessionHydration } from "@/components/app-shell-session-hydration";
import { AppShellStableBoundary } from "@/components/app-shell-stable-boundary";
import { BottomNav } from "@/components/bottom-nav";
import { IncomingChatInboxProvider } from "@/features/chat/incoming-chat-inbox-provider";
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
  "/delete-account",
  "/welcome",
  "/charter",
  "/sitter/onboarding"
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

export function isMainLayoutPath(pathname: string): boolean {
  return MAIN_LAYOUT_PREFIXES.some(
    (p) =>
      pathname === p ||
      pathname.startsWith(`${p}/`)
  );
}

/**
 * Canonical bottom inset for page content: fixed BottomNav + elevated FAB
 * + optional AnyNanny Now dock + iOS safe-area.
 */
const SHELL_BOTTOM_NAV_PADDING =
  "pb-[calc(8rem+var(--anynanny-now-dock,0px)+env(safe-area-inset-bottom,0px))]";

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

  return (
    <SessionProvider>
      <AppShellSessionHydration />
      <PushRuntime />

      <AppShellStableBoundary>
        <IncomingChatInboxProvider>
          {/*
           * Document-level vertical scrolling (native html/body).
           * Do not put overflow-y-auto / overflow-hidden on this shell —
           * nested scrollers plus overflow-hidden descendants trap iOS
           * touch gestures so only the bottom padding/nav area scrolls.
           */}
          <div className="flex min-h-dvh min-w-0 flex-col bg-[#FDFBF6]">
            <AppShellHeader />
            <GlobalCoordinationNotifications />

            <div
              className={[
                "min-w-0",
                "flex-1",
                mainLayout ? "" : "px-4 pt-4",
                SHELL_BOTTOM_NAV_PADDING
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <RouteTransitionShell>
                <PushPermissionBanner />
                {children}
              </RouteTransitionShell>
            </div>

            <ParentActiveNowDock pathname={pathname} />
            <StableBottomNav />
          </div>
        </IncomingChatInboxProvider>
      </AppShellStableBoundary>
    </SessionProvider>
  );
}