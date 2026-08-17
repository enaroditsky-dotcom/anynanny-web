import type { CSSProperties, ReactNode } from "react";

const CARD = "rounded-3xl border border-slate-200/60 bg-white p-4 shadow-soft";
const TITLE = "text-lg font-semibold leading-snug text-[#001F3F]";
const TOGGLE =
  "inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-base font-medium text-[#001F3F]";
const CHECKBOX = "h-[18px] w-[18px] rounded border-slate-300 accent-[#001F3F]";
const INACTIVE = "mt-2.5 text-right text-sm font-medium leading-relaxed text-slate-500";

/**
 * Shared chrome for optional Parent Search limiters (price, distance).
 */
export function SearchLimitToggleCard({
  title,
  toggleLabel,
  enabled,
  onEnabledChange,
  inactiveHint,
  children,
  footer
}: {
  title: string;
  toggleLabel: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  inactiveHint: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className={CARD}>
      <div className="flex items-center justify-between gap-2">
        <label className={TOGGLE}>
          <input
            type="checkbox"
            className={CHECKBOX}
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
          />
          {toggleLabel}
        </label>
        <span className={TITLE}>{title}</span>
      </div>
      {enabled ? children : <p className={INACTIVE}>{inactiveHint}</p>}
      {footer}
    </div>
  );
}

export function searchLimitSliderProgress(value: number, min: number, max: number): CSSProperties {
  const span = max - min;
  const pct = span <= 0 ? 0 : Math.min(100, Math.max(0, ((value - min) / span) * 100));
  return { ["--search-slider-progress" as string]: `${pct}%` };
}

export const SEARCH_LIMIT_SLIDER_CLASS = "anynanny-search-slider mt-1 w-full cursor-pointer";

export const SEARCH_LIMIT_SLIDER_ENDS =
  "mt-1 flex justify-between text-sm font-medium text-slate-500";

export const SEARCH_LIMIT_VALUE_ROW =
  "mt-3 flex items-center justify-between gap-2 text-base font-semibold text-[#001F3F]";

export const SEARCH_LIMIT_CLEAR_BUTTON =
  "text-sm font-medium text-slate-500 underline underline-offset-2 transition hover:text-[#001F3F]";

export const SEARCH_LIMIT_VALUE_BADGE =
  "rounded-xl border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 text-base font-semibold tabular-nums text-emerald-800";
