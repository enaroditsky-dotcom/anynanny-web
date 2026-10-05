"use client";

import type { ReactNode } from "react";
import { memo, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { APP_SHELL_SCROLL_ID } from "@/lib/ui/app-shell";

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
  "/auth/verified",
  "/reset-password",
  "/login",
  "/register",
  "/terms",
  "/privacy",
  "/delete-account",
  "/babysitter",
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
  "pb-[calc(6.5rem+var(--anynanny-now-dock,0px)+env(safe-area-inset-bottom,0px))]";

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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    if (isChromelessAuthPath(pathname)) return;
    const html = document.documentElement;
    const body = document.body;
    const previousHtml = html.style.overflow;
    const previousBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = previousHtml;
      body.style.overflow = previousBody;
    };
  }, [pathname]);

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
           * One scrollport between the in-flow header and the fixed BottomNav.
           * html/body stay unscrollable here so iOS does not get a second scroller.
           */}
          <div className="flex h-dvh max-h-dvh min-h-0 min-w-0 flex-col overflow-hidden bg-[#FDFBF6]">
            <AppShellHeader />
            <GlobalCoordinationNotifications />

            <div
              id={APP_SHELL_SCROLL_ID}
              ref={scrollRef}
              className={[
                "min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain",
                mainLayout ? "" : "px-2 pt-2",
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