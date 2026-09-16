/**
 * Shared authenticated-app geometry. Prefer these over one-off max-widths
 * and dashboard tile sizes so parent/sitter chrome stay consistent.
 *
 * Do not use CSS zoom / transform scale. These are real layout sizes.
 */

/** Primary content column — 24rem. Narrower than max-w-md so desktop preview feels phone-like. */
export const APP_CONTENT_MAX_W = "max-w-sm";

/** Dashboard shortcut tile (the whole card is the tap target). */
export const DASHBOARD_SHORTCUT_TILE =
  "group flex min-h-[3.5rem] min-w-0 flex-col items-end justify-between gap-0.5 rounded-xl p-1.5 text-right shadow-sm transition active:scale-[0.98]";

export const DASHBOARD_SHORTCUT_ICON_WRAP =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm";

export const DASHBOARD_SHORTCUT_ICON = "h-5 w-5 stroke-[1.75]";

export const DASHBOARD_SHORTCUT_LABEL =
  "w-full text-right text-[11px] font-semibold leading-snug";
