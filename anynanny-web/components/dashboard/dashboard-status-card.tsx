"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";

export type DashboardStatusCardProps = {
  /** Short label shown when the card is collapsed. */
  collapsedSummary: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** When set, shows an X that dismisses the card without navigating away. */
  onDismiss?: () => void;
  dismissLabel?: string;
  children: ReactNode;
  className?: string;
  /** Optional tone for the shell. */
  tone?: "emerald" | "amber" | "rose" | "slate";
};

const TONE_CLASS: Record<NonNullable<DashboardStatusCardProps["tone"]>, string> = {
  emerald: "border-emerald-200 bg-emerald-50/60",
  amber: "border-amber-200 bg-amber-50/70",
  rose: "border-rose-200 bg-rose-50/70",
  slate: "border-slate-200 bg-slate-50/80"
};

/**
 * Non-blocking dashboard status shell: collapse to a compact bar, or dismiss with X.
 * Keeps search / nav usable while booking workflows run in the background.
 */
export function DashboardStatusCard({
  collapsedSummary,
  collapsed = false,
  onToggleCollapse,
  onDismiss,
  dismissLabel = "סגור התראה",
  children,
  className = "",
  tone = "emerald"
}: DashboardStatusCardProps) {
  return (
    <div
      className={`rounded-2xl border p-3 text-center shadow-sm ${TONE_CLASS[tone]} ${className}`}
      role="region"
      aria-label={collapsedSummary}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              aria-label={dismissLabel}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/80 hover:text-slate-800"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <span className="h-8 w-8" aria-hidden />
          )}
        </div>

        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "הרחב סטטוס משמרת" : "צמצם סטטוס משמרת"}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-white/80 hover:text-slate-900"
          >
            <span>{collapsed ? "הרחב" : "צמצם"}</span>
            {collapsed ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        ) : (
          <span className="h-8 w-8" aria-hidden />
        )}
      </div>

      {collapsed ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="w-full rounded-xl bg-white/70 px-3 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-white"
        >
          {collapsedSummary}
        </button>
      ) : (
        <div className="space-y-3 px-1 pb-1">{children}</div>
      )}
    </div>
  );
}
