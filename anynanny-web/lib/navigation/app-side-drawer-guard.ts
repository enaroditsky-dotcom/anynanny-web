import { APP_SIDE_DRAWER_ID } from "@/lib/navigation/app-side-drawer";
import { APP_DRAWER_TOUR_OVERLAY_SELECTOR } from "@/lib/navigation/app-side-drawer-destinations";

const MENU_BUTTON_SELECTOR = `[aria-controls="${APP_SIDE_DRAWER_ID}"]`;

type ClosestTarget = {
  closest: (selector: string) => ClosestTarget | null;
};

function closestTarget(target: unknown): ClosestTarget | null {
  if (!target || typeof target !== "object") return null;
  const node = target as { closest?: unknown; parentElement?: ClosestTarget | null };
  if (typeof node.closest === "function") return node as ClosestTarget;
  const parent = node.parentElement;
  if (parent && typeof parent.closest === "function") return parent;
  return null;
}

/**
 * Drawer controls and the product-tour spotlight may receive the gesture.
 * Everything else, including the fixed bottom navigation, is background.
 */
export function isDrawerChromeTarget(target: unknown): boolean {
  const element = closestTarget(target);
  if (!element) return false;
  if (element.closest(`#${APP_SIDE_DRAWER_ID}`)) return true;
  if (element.closest(MENU_BUTTON_SELECTOR)) return true;
  if (element.closest(APP_DRAWER_TOUR_OVERLAY_SELECTOR)) return true;
  return false;
}

type CancelableClick = {
  target: unknown;
  preventDefault: () => void;
  stopImmediatePropagation: () => void;
};

/**
 * Cancel a background click before a link's own handler can navigate.
 * Returns true when the event belonged to the page behind the drawer.
 */
export function guardDrawerBackgroundClick(event: CancelableClick, holdOpen: boolean, close: () => void): boolean {
  if (isDrawerChromeTarget(event.target)) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!holdOpen) close();
  return true;
}
