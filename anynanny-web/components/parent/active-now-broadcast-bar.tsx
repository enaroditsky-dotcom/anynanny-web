"use client";

import { ChevronUp, MapPin, Zap } from "lucide-react";
import type { ParentActiveBroadcast } from "@/lib/broadcast/parent-active-broadcast";
import { formatBroadcastElapsed } from "@/lib/broadcast/parent-active-broadcast";

type Props = {
  broadcast: ParentActiveBroadcast;
  responseCount: number;
  nowMs: number;
  onRestore: () => void;
};

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
      className="pointer-events-none fixed inset-x-0 z-[55] px-3"
      style={{
        bottom: "calc(7.25rem + env(safe-area-inset-bottom, 0px))"
      }}
    >
      <button
        type="button"
        onClick={onRestore}
        className="pointer-events-auto mx-auto flex w-full max-w-md flex-row items-center gap-3 rounded-2xl border border-[#FF8A8A]/35 bg-white px-3.5 py-2.5 text-right shadow-[0_10px_28px_-8px_rgba(0,31,63,0.32)] ring-1 ring-[#FF8A8A]/15"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF8A8A] text-white shadow-sm">
          <Zap className="h-5 w-5 fill-white" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="flex flex-wrap items-center justify-start gap-1.5 text-sm font-extrabold text-[#001F3F]">
            AnyNanny Now
            <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF0F0] px-2 py-0.5 text-[10px] font-bold text-[#FF8A8A]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF8A8A] opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#FF8A8A]" />
              </span>
              מחפשים נני
            </span>
          </span>
          <span className="block text-[11px] font-semibold text-slate-600">
            חיפוש פעיל ב{city}
          </span>
          <span className="flex flex-wrap items-center justify-start gap-x-2 gap-y-0.5 text-[11px] font-semibold text-slate-600">
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="h-3 w-3 text-[#FF8A8A]" aria-hidden />
              {city}
            </span>
            <span className="tabular-nums">⏱ {elapsed}</span>
            <span>{responsesLabel}</span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-center gap-0.5 text-[#001F3F]">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
            <ChevronUp className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-[10px] font-bold">הרחב</span>
        </span>
      </button>
    </div>
  );
}
