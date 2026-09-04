/**
 * Authenticated-app modal overlay: the overlay can still scroll as a fallback
 * so BottomNav never traps the last action. Tall dialogs also constrain the
 * card and scroll the body so the header stays visible.
 */
export const AUTH_MODAL_NAV_INSET =
  "pb-[calc(8rem+var(--anynanny-now-dock,0px)+env(safe-area-inset-bottom,0px))] scroll-pb-[calc(8rem+var(--anynanny-now-dock,0px)+env(safe-area-inset-bottom,0px))]";

export const AUTH_MODAL_OVERLAY_SCROLL =
  `overflow-y-auto overscroll-contain px-4 pt-4 ${AUTH_MODAL_NAV_INSET}`;

export const AUTH_MODAL_CENTER_WRAP = "flex min-h-full justify-center";

/**
 * Tall dialogs (Parent Details): keep the rounded card inside the mobile
 * viewport and scroll the body so the header stays visible. 8.5rem matches
 * overlay top padding + BottomNav clearance from AUTH_MODAL_NAV_INSET.
 */
export const AUTH_MODAL_CARD_SHELL =
  "my-auto flex w-full max-w-sm flex-col overflow-hidden rounded-3xl bg-white shadow-2xl " +
  "max-h-[calc(100dvh-8.5rem-var(--anynanny-now-dock,0px)-env(safe-area-inset-bottom,0px))]";

export const AUTH_MODAL_HEADER =
  "flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-5 py-4";

export const AUTH_MODAL_BODY_SCROLL =
  "min-h-0 flex-1 overflow-y-auto overscroll-contain p-5";
