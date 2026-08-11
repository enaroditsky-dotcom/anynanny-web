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

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] z-40 px-3">
      <button
        type="button"
        onClick={onRestore}
        className="pointer-events-auto mx-auto flex w-full max-w-md flex-row-reverse items-center gap-3 rounded-2xl border border-[#FF8A8A]/30 bg-white px-3.5 py-3 text-right shadow-[0_8px_24px_-10px_rgba(0,31,63,0.28)] ring-1 ring-[#FF8A8A]/10"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF8A8A] text-white shadow-sm">
          <Zap className="h-5 w-5 fill-white" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="flex items-center justify-start gap-1.5 text-sm font-extrabold text-[#001F3F]">
            AnyNanny Now
            <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF0F0] px-2 py-0.5 text-[10px] font-bold text-[#FF8A8A]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF8A8A] opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#FF8A8A]" />
              </span>
              מחפשים נני
            </span>
          </span>
          <span className="flex flex-wrap items-center justify-start gap-x-2 gap-y-0.5 text-[11px] font-semibold text-slate-600">
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="h-3 w-3 text-[#FF8A8A]" aria-hidden />
              {city}
            </span>
            <span className="tabular-nums">⏱ {elapsed}</span>
            <span>
              {responseCount === 0
                ? "אין פניות עדיין"
                : responseCount === 1
                  ? "פנייה אחת"
                  : `${responseCount} פניות`}
            </span>
          </span>
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <ChevronUp className="h-4 w-4" aria-hidden />
          <span className="sr-only">הרחבת השידור</span>
        </span>
      </button>
    </div>
  );
}
