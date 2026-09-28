import React from "react";
import {
  NOW_SOON_RECOMMENDATION_BODY,
  NOW_SOON_RECOMMENDATION_TITLE,
  NOW_SWITCH_TO_ASAP_LABEL
} from "@/lib/broadcast/now-request-details";

/** Shown before send when the chosen time is still today and at most 60 minutes away. */
export function NowSoonTimeRecommendation({
  requestedTime,
  disabled = false,
  onSwitchToAsap,
  onKeepSpecific,
  onDismiss
}: {
  requestedTime: string;
  disabled?: boolean;
  onSwitchToAsap: () => void;
  onKeepSpecific: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[#001F3F]/45 p-4 sm:items-center"
      dir="rtl"
      onClick={onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="now-soon-title"
        className="w-full max-w-md rounded-3xl border border-slate-200/70 bg-white p-5 text-right shadow-soft"
        onClick={(event) => event.stopPropagation()}
      >
        <p id="now-soon-title" className="text-[18px] font-semibold leading-snug text-[#001F3F]">
          {NOW_SOON_RECOMMENDATION_TITLE}
        </p>
        <p className="mt-2 text-[15px] font-medium leading-relaxed text-[#001F3F]/80">
          {NOW_SOON_RECOMMENDATION_BODY}
        </p>
        <div className="mt-5 grid gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={onSwitchToAsap}
            className="min-h-12 rounded-[15px] px-3 text-[15px] font-semibold text-white disabled:opacity-60"
            style={{
              background: "linear-gradient(180deg, #19c56f 0%, #00A86B 48%, #088A58 100%)"
            }}
          >
            {NOW_SWITCH_TO_ASAP_LABEL}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onKeepSpecific}
            className="min-h-12 rounded-[15px] border border-slate-200 bg-white px-3 text-[15px] font-semibold text-[#001F3F] disabled:opacity-60"
          >
            להישאר עם <span dir="ltr">{requestedTime}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
