/**
 * Overlay-drawer motion. The drawer slides in from the physical right and
 * covers the page below the header. The scrollport in `#app-shell-scroll`
 * never receives a transform: a resting transform on that shell breaks touch
 * scrolling on iOS and mobile Chrome. The drawer transform is removed once
 * the phase returns to `closed`.
 */

export const APP_SIDE_DRAWER_ID = "app-side-drawer";
export const APP_SIDE_DRAWER_TITLE_ID = "app-side-drawer-title";
export const APP_SIDE_DRAWER_WIDTH = "min(78vw, 340px)";
/** Matches the app header: safe-area padding plus the 5.2rem logo row. */
export const APP_SIDE_DRAWER_TOP = "calc(5.2rem + env(safe-area-inset-top, 0px))";
/**
 * Clearance inside the panel so logout stays at the top of the fixed nav.
 * The panel itself continues to the viewport bottom, wallpaper included.
 * The nav's own padding already includes the device safe area.
 */
export const APP_SIDE_DRAWER_BOTTOM =
  "calc(4.875rem + max(0.75rem, env(safe-area-inset-bottom, 0px)))";
export const APP_SIDE_DRAWER_MS = 300;
export const APP_SIDE_DRAWER_BACKDROP = "rgba(0, 31, 63, 0.42)";

export type DrawerPhase = "closed" | "opening" | "open" | "closing";
export type DrawerPhaseEvent = "open" | "close" | "settle-open" | "settle-closed" | "force-closed";

export type DrawerPanelStyle = {
  transform: string;
  transition?: string;
};

/** Positive X is the physical right, in both LTR and RTL. */
const OFFSCREEN = "translate3d(100%, 0, 0)";
const ONSCREEN = "translate3d(0, 0, 0)";
const TRANSITION = `transform ${APP_SIDE_DRAWER_MS}ms ease-out`;
const FADE = `opacity ${APP_SIDE_DRAWER_MS}ms ease-out`;

/** Parent and sitter app routes. Chromeless paths are excluded by the shell. */
export function isAppDrawerRoute(pathname: string): boolean {
  return (
    pathname === "/parent" ||
    pathname.startsWith("/parent/") ||
    pathname === "/sitter" ||
    pathname.startsWith("/sitter/")
  );
}

export function nextDrawerPhase(
  phase: DrawerPhase,
  event: DrawerPhaseEvent,
  reducedMotion: boolean
): DrawerPhase {
  if (event === "force-closed") return "closed";

  if (event === "open") {
    if (phase === "open" || phase === "opening") return phase;
    return reducedMotion ? "open" : "opening";
  }

  if (event === "close") {
    if (phase === "closed" || phase === "closing") return phase;
    // The opening frame is still off-screen, so skip the close animation.
    if (phase === "opening") return "closed";
    return reducedMotion ? "closed" : "closing";
  }

  if (event === "settle-open") return phase === "opening" ? "open" : phase;
  if (event === "settle-closed") return phase === "closing" ? "closed" : phase;
  return phase;
}

/**
 * `undefined` when closed: no transform remains on the drawer.
 * `opening` is the off-screen first frame, without a transition, so the
 * following `open` frame can animate in from the physical right.
 */
export function drawerPanelStyle(phase: DrawerPhase, reducedMotion: boolean): DrawerPanelStyle | undefined {
  if (phase === "closed") return undefined;
  if (reducedMotion) {
    if (phase === "closing") return undefined;
    return { transform: ONSCREEN };
  }
  if (phase === "opening") return { transform: OFFSCREEN };
  if (phase === "open") return { transform: ONSCREEN, transition: TRANSITION };
  return { transform: OFFSCREEN, transition: TRANSITION };
}

/** Backdrop fades with the panel. The header stays outside this layer. */
export function drawerBackdropStyle(
  phase: DrawerPhase,
  reducedMotion: boolean
): { opacity: number; transition?: string } | undefined {
  if (phase === "closed") return undefined;
  if (reducedMotion) return { opacity: phase === "closing" ? 0 : 1 };
  if (phase === "opening") return { opacity: 0 };
  if (phase === "open") return { opacity: 1, transition: FADE };
  return { opacity: 0, transition: FADE };
}

/**
 * True when some other modal dialog is already taking the viewport.
 * `ignoreSelector` skips a presentation layer that is allowed to stay up,
 * such as the product-tour spotlight while a drawer row is its target.
 */
export function hasBlockingOverlay(drawerId: string = APP_SIDE_DRAWER_ID, ignoreSelector?: string): boolean {
  if (typeof document === "undefined") return false;
  const nodes = document.querySelectorAll<HTMLElement>('[aria-modal="true"], dialog[open]');
  for (const node of nodes) {
    if (node.id === drawerId) continue;
    if (ignoreSelector && (node.matches(ignoreSelector) || node.closest(ignoreSelector))) continue;
    if (node.closest("[hidden]")) continue;
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") continue;
    return true;
  }
  return false;
}
