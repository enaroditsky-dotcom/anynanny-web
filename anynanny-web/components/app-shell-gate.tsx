"use client";

import type { ReactNode } from "react";
import { memo, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { classifySiteHost, classifySitePath, resolvePublicSiteHost, type SiteHostRole } from "@/lib/hosts/site-classifier";

import { AppSideDrawerFrame } from "@/components/navigation/app-side-drawer-frame";
import { useAppSideDrawer } from "@/components/navigation/use-app-side-drawer";
import { isAppDrawerRoute } from "@/lib/navigation/app-side-drawer";
import { GlobalCoordinationNotifications } from "@/components/notifications/global-coordination-notifications";
import { AppShellSessionHydration } from "@/components/app-shell-session-hydration";
import { AppShellStableBoundary } from "@/components/app-shell-stable-boundary";
import { BottomNav } from "@/components/bottom-nav";
import { IncomingChatInboxProvider } from "@/features/chat/incoming-chat-inbox-provider";
import { ParentActiveNowDock } from "@/components/parent/parent-active-now-dock";
import { MarketingConsentPrompt } from "@/components/marketing/marketing-consent-prompt";
import { PushPermissionBanner } from "@/components/push/push-permission-banner";
import { PushRuntime } from "@/components/push/push-runtime";
import { RouteTransitionShell } from "@/components/route-transition-shell";
import { MarketingPortal } from "@/components/marketing/marketing-portal";
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
  "/app",
  "/parents",
  "/story",
  "/welcome",
  "/charter",
  "/sitter/onboarding",
  "/dev/side-drawer",
  "/dev/parent-profile-header"
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


export function isMarketingPortalPath(pathname: string, hostRole: SiteHostRole): boolean {
  if (hostRole === "app" || hostRole === "apex") return false;
  const kind = classifySitePath(pathname);
  if (kind === "marketing") return true;
  return kind === "entry" && hostRole === "www";
}

export function AppShellGate({
  children,
  siteHost = ""
}: {
  children: ReactNode;
  siteHost?: string;
}) {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const hostRole: SiteHostRole = classifySiteHost(resolvePublicSiteHost({ host: siteHost }));
  const portal = isMarketingPortalPath(pathname, hostRole);
  const drawerEnabled = !portal && !isChromelessAuthPath(pathname) && isAppDrawerRoute(pathname);
  const drawer = useAppSideDrawer(drawerEnabled, pathname);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    if (portal || isChromelessAuthPath(pathname)) return;
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
  }, [pathname, portal]);

  const chromeless = isChromelessAuthPath(pathname);

  /**
   * Auth / landing pages manage their own layout.
   */
  if (portal || chromeless) {
    return (
      <SessionProvider>
        <AppShellSessionHydration />
        <PushRuntime />
        <MarketingConsentPrompt />

        <RouteTransitionShell>
          {portal ? <MarketingPortal>{children}</MarketingPortal> : children}
        </RouteTransitionShell>
      </SessionProvider>
    );
  }

  const mainLayout = isMainLayoutPath(pathname);

  return (
    <SessionProvider>
      <AppShellSessionHydration />
      <PushRuntime />
      <MarketingConsentPrompt />

      <AppShellStableBoundary>
        <IncomingChatInboxProvider>
          {/*
           * One scrollport between the in-flow header and the fixed BottomNav.
           * html/body stay unscrollable here so iOS does not get a second scroller.
           */}
          <AppSideDrawerFrame
            clipRef={drawer.clipRef}
            scrollRef={scrollRef}
            phase={drawer.phase}
            enabled={drawer.enabled}
            clipRaised={drawer.clipRaised}
            panelStyle={drawer.panelStyle}
            backdropStyle={drawer.backdropStyle}
            onPanelTransitionEnd={drawer.onPanelTransitionEnd}
            onOpenMenu={drawer.toggleDrawer}
            onClose={drawer.closeDrawer}
            menuButtonRef={drawer.menuButtonRef}
            scrollClassName={[mainLayout ? "" : "px-2 pt-2", SHELL_BOTTOM_NAV_PADDING].filter(Boolean).join(" ")}
            belowHeader={<GlobalCoordinationNotifications />}
            footer={
              <>
                <ParentActiveNowDock pathname={pathname} />
                <StableBottomNav />
              </>
            }
          >
            <RouteTransitionShell>
              <PushPermissionBanner />
              {children}
            </RouteTransitionShell>
          </AppSideDrawerFrame>
        </IncomingChatInboxProvider>
      </AppShellStableBoundary>
    </SessionProvider>
  );
}