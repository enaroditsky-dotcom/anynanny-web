"use client";

import { ChevronDown, Zap } from "lucide-react";
import type { ParentActiveBroadcast } from "@/lib/broadcast/parent-active-broadcast";
import { formatBroadcastElapsed } from "@/lib/broadcast/parent-active-broadcast";

type Props = {
  broadcast: ParentActiveBroadcast;
  responseCount: number;
  nowMs: number;
  onRestore: () => void;
};

/**
 * Compact single-row status strip above bottom nav (~56–64px).
 * Minimize must feel like minimize — not a large card over the dashboard.
 */
export function ActiveNowBroadcastBar({
  broadcast,
  responseCount,
  nowMs,
  onRestore
}: Props) {
  const elapsed = formatBroadcastElapsed(broadcast.created_at, nowMs);
  const city = broadcast.city.trim() || "ישראל";
  const responsesLabel =
    responseCount === 0
      ? "0 פניות"
      : responseCount === 1
        ? "פנייה אחת"
        : `${responseCount} פניות`;

  return (
    <div
      dir="rtl"
      className="pointer-events-none fixed inset-x-0 z-[55] px-2.5 sm:px-3"
      style={{
        /* Clear fixed BottomNav rail + elevated AnyNanny Now FAB, keep a small gap. */
        bottom: "calc(7rem + env(safe-area-inset-bottom, 0px))"
      }}
    >
      <button
        type="button"
        onClick={onRestore}
        aria-label="הרחב AnyNanny Now"
        className="pointer-events-auto mx-auto flex h-14 w-full max-w-md items-center gap-2 overflow-hidden rounded-xl border border-[#FF8A8A]/30 bg-white/95 px-2.5 text-right shadow-[0_6px_18px_-10px_rgba(0,31,63,0.35)] backdrop-blur-sm"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FF8A8A] text-white">
          <Zap className="h-3.5 w-3.5 fill-white" aria-hidden />
        </span>

        <span className="min-w-0 flex-1 truncate text-[11px] font-bold leading-tight text-[#001F3F]">
          <span className="whitespace-nowrap">AnyNanny Now</span>
          <span className="mx-1 font-semibold text-slate-300" aria-hidden>
            |
          </span>
          <span className="whitespace-nowrap text-slate-700">{city}</span>
          <span className="mx-1 font-semibold text-slate-300" aria-hidden>
            |
          </span>
          <span className="whitespace-nowrap tabular-nums text-slate-700">
            {elapsed}
          </span>
          <span className="mx-1 font-semibold text-slate-300" aria-hidden>
            |
          </span>
          <span className="whitespace-nowrap text-slate-700">{responsesLabel}</span>
        </span>

        <span className="flex shrink-0 items-center gap-0.5 text-[10px] font-bold text-[#001F3F]">
          <span>הרחב</span>
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </span>
      </button>
    </div>
  );
}
