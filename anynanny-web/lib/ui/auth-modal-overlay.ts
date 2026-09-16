/**
 * Authenticated-app modal overlay: the overlay can still scroll as a fallback
 * so BottomNav never traps the last action. Tall dialogs also constrain the
 * card and scroll the body so the header stays visible.
 */
export const AUTH_MODAL_NAV_INSET =
  "pb-[calc(8rem+var(--anynanny-now-dock,0px)+env(safe-area-inset-bottom,0px))] scroll-pb-[calc(8rem+var(--anynanny-now-dock,0px)+env(safe-area-inset-bottom,0px))]";

export const AUTH_MODAL_OVERLAY_SCROLL =
  `overflow-y-auto overscroll-contain px-3 pt-3 ${AUTH_MODAL_NAV_INSET}`;

export const AUTH_MODAL_CENTER_WRAP = "flex min-h-full justify-center";

/**
 * Tall dialogs (Parent Details, hours editor): keep the rounded card inside
 * the mobile viewport and scroll the body so the header stays visible.
 * 8.5rem matches overlay top padding + BottomNav clearance from AUTH_MODAL_NAV_INSET.
 */
export const AUTH_MODAL_CARD_MAX_H =
  "max-h-[calc(100dvh-8.5rem-var(--anynanny-now-dock,0px)-env(safe-area-inset-bottom,0px))]";

export const AUTH_MODAL_CARD_SHELL =
  `my-auto flex min-h-0 w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${AUTH_MODAL_CARD_MAX_H}`;

export const AUTH_MODAL_CARD_SHELL_MD =
  `my-auto flex min-h-0 w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${AUTH_MODAL_CARD_MAX_H}`;

export const AUTH_MODAL_HEADER =
  "flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4 py-3";

export const AUTH_MODAL_BODY_SCROLL =
  "min-h-0 flex-1 overflow-y-auto overscroll-contain p-4";

export const AUTH_MODAL_FOOTER =
  "flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-white px-4 py-2.5";
