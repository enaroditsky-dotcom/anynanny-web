import type { CSSProperties, ReactNode } from "react";

const CARD = "rounded-3xl border border-slate-200/60 bg-white p-4 shadow-soft";
const TITLE = "text-[1.25rem] font-semibold leading-snug text-[#001F3F]";
const TOGGLE =
  "inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium text-[#001F3F]";
const CHECKBOX = "h-[18px] w-[18px] rounded border-slate-300 accent-[#001F3F]";
const INACTIVE = "text-right text-[15px] font-medium leading-relaxed text-slate-500";

/**
 * Shared chrome for optional Parent Search limiters (price, distance).
 */
export function SearchLimitToggleCard({
  title,
  icon,
  toggleLabel,
  enabled,
  onEnabledChange,
  inactiveHint,
  children,
  footer
}: {
  title: string;
  icon?: ReactNode;
  toggleLabel: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  inactiveHint: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className={`${CARD} space-y-3`}>
      <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
        {icon ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            {icon}
          </span>
        ) : null}
        <span className={TITLE}>{title}</span>
      </div>

      <div className="space-y-3">
        {!enabled ? <p className={INACTIVE}>{inactiveHint}</p> : null}
        <label className={TOGGLE}>
          <input
            type="checkbox"
            className={CHECKBOX}
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
          />
          {toggleLabel}
        </label>
        {enabled ? children : null}
        {footer}
      </div>
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
  "mt-1 flex justify-between text-[15px] font-medium text-slate-500";

export const SEARCH_LIMIT_VALUE_ROW =
  "mt-3 flex items-center justify-between gap-2 text-sm font-semibold text-[#001F3F]";

export const SEARCH_LIMIT_CLEAR_BUTTON =
  "text-[15px] font-medium text-slate-500 underline underline-offset-2 transition hover:text-[#001F3F]";

export const SEARCH_LIMIT_VALUE_BADGE =
  "rounded-xl border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 text-sm font-semibold tabular-nums text-emerald-800";
