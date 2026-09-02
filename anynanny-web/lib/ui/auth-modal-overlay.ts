/**
 * Authenticated-app modal overlay: the overlay is the only vertical scroller
 * so BottomNav never traps the last action. Card stays in document flow.
 */
export const AUTH_MODAL_NAV_INSET =
  "pb-[calc(8rem+var(--anynanny-now-dock,0px)+env(safe-area-inset-bottom,0px))] scroll-pb-[calc(8rem+var(--anynanny-now-dock,0px)+env(safe-area-inset-bottom,0px))]";

export const AUTH_MODAL_OVERLAY_SCROLL =
  `overflow-y-auto overscroll-contain px-4 pt-4 ${AUTH_MODAL_NAV_INSET}`;

export const AUTH_MODAL_CENTER_WRAP = "flex min-h-full justify-center";
