"use client";

import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode, Ref, TransitionEvent } from "react";
import { AppShellHeader } from "@/components/app-shell-header";
import { AppSideDrawer, AppSideDrawerCatcher } from "@/components/navigation/app-side-drawer";
import { APP_SIDE_DRAWER_ID, type DrawerPanelStyle, type DrawerPhase } from "@/lib/navigation/app-side-drawer";
import { APP_SHELL_SCROLL_ID } from "@/lib/ui/app-shell";

const CLIP_CLASS = "relative h-dvh max-h-dvh min-h-0 min-w-0 overflow-hidden";
const CLIP_RAISED_CLASS = "relative z-[80] h-dvh max-h-dvh min-h-0 min-w-0 overflow-hidden";
const MENU_BUTTON_SELECTOR = `[aria-controls="${APP_SIDE_DRAWER_ID}"]`;

function isMenuButtonTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(MENU_BUTTON_SELECTOR));
}

export type AppSideDrawerFrameProps = {
  clipRef: Ref<HTMLDivElement>;
  scrollRef?: Ref<HTMLDivElement>;
  phase: DrawerPhase;
  enabled: boolean;
  clipRaised: boolean;
  panelStyle?: DrawerPanelStyle;
  backdropStyle?: CSSProperties;
  onPanelTransitionEnd: (event: TransitionEvent<HTMLElement>) => void;
  onOpenMenu: () => void;
  onClose: () => void;
  menuButtonRef: Ref<HTMLButtonElement>;
  navigationRole?: "parent" | "sitter";
  navigationPath?: string;
  onHomePress?: () => void;
  scrollClassName?: string;
  belowHeader?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

/**
 * Shared overlay-drawer shell. The header stays put. The drawer and backdrop
 * cover the page below it. The authenticated gate and the development preview
 * both render this frame.
 */
export function AppSideDrawerFrame({
  clipRef,
  scrollRef,
  phase,
  enabled,
  clipRaised,
  panelStyle,
  backdropStyle,
  onPanelTransitionEnd,
  onOpenMenu,
  onClose,
  menuButtonRef,
  navigationRole,
  navigationPath,
  onHomePress,
  scrollClassName,
  belowHeader,
  footer,
  children
}: AppSideDrawerFrameProps) {
  const drawerActive = phase !== "closed";

  const blockUnderlyingChrome = (event: MouseEvent<HTMLElement>) => {
    if (!drawerActive || isMenuButtonTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  const blockUnderlyingKeys = (event: KeyboardEvent<HTMLElement>) => {
    if (!drawerActive || isMenuButtonTarget(event.target)) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  return (
    <div
      ref={clipRef}
      data-app-side-drawer={phase}
      className={[clipRaised ? CLIP_RAISED_CLASS : CLIP_CLASS, "flex flex-col"].join(" ")}
    >
      <div
        className="relative z-[90] shrink-0"
        onClickCapture={blockUnderlyingChrome}
        onKeyDownCapture={blockUnderlyingKeys}
      >
        <AppShellHeader
          showMenu={enabled}
          menuExpanded={drawerActive}
          onOpenMenu={onOpenMenu}
          menuButtonRef={menuButtonRef}
          onHomePress={onHomePress}
        />
      </div>
      <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-[#FDFBF6]">
        <div
          className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden"
          inert={phase !== "closed"}
        >
          {belowHeader}
          <div
            id={APP_SHELL_SCROLL_ID}
            ref={scrollRef}
            className={[
              "min-h-0 min-w-0 flex-1 overflow-x-hidden",
              drawerActive ? "overflow-hidden overscroll-none" : "overflow-y-auto overscroll-y-contain",
              scrollClassName ?? ""
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {children}
          </div>
        </div>
        <div className={drawerActive ? "[&_*]:pointer-events-none" : undefined} inert={phase !== "closed"}>
          {footer}
        </div>
      </div>
      {enabled ? (
        <AppSideDrawer
          phase={phase}
          onClose={onClose}
          panelStyle={panelStyle}
          onTransitionEnd={onPanelTransitionEnd}
          navigationRole={navigationRole}
          navigationPath={navigationPath}
        />
      ) : null}
      {clipRaised ? <AppSideDrawerCatcher onClose={onClose} motionStyle={backdropStyle} /> : null}
    </div>
  );
}
