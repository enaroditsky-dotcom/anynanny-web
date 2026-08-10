"use client";

import { useState } from "react";
import { StarRatingInput } from "@/components/session/star-rating-input";

type SitterMandatoryRatingPanelProps = {
  busy?: boolean;
  errorMessage?: string | null;
  onComplete: (rating: number) => void | Promise<void>;
};

/** Sitter post-payment closure — mandatory star rating before returning to dashboard. */
export function SitterMandatoryRatingPanel({
  busy = false,
  errorMessage,
  onComplete
}: SitterMandatoryRatingPanelProps) {
  const [rating, setRating] = useState(0);
  const canComplete = rating >= 1 && !busy;

  return (
    <div className="flex w-full shrink-0 flex-col items-center gap-5 px-2 py-2 text-center">
      <div className="space-y-1">
        <p className="text-lg font-bold text-[#001F3F]">המשמרת הסתיימה!</p>
        <p className="text-sm font-semibold text-navy-800">דרגי את המשפחה:</p>
      </div>

      <StarRatingInput value={rating} onChange={setRating} disabled={busy} />

      {errorMessage ? (
        <p className="max-w-[17rem] text-center text-xs font-medium text-rose-700">{errorMessage}</p>
      ) : null}

      <button
        type="button"
        disabled={!canComplete}
        onClick={() => void onComplete(rating)}
        className="w-full max-w-[17rem] rounded-xl bg-[#001F3F] px-5 py-3 text-sm font-bold text-white shadow-md shadow-[#001F3F]/25 ring-1 ring-[#001F3F]/20 transition hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? "שומרים…" : "סיום וחזרה"}
      </button>
    </div>
  );
}
