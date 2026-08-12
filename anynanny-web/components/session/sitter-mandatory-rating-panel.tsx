"use client";

import { useState } from "react";
import { StarRatingInput } from "@/components/session/star-rating-input";

type SitterMandatoryRatingPanelProps = {
  busy?: boolean;
  errorMessage?: string | null;
  onComplete: (rating: number, comment: string | null) => void | Promise<void>;
};

/** Sitter post-payment closure — mandatory star rating before returning to dashboard. */
export function SitterMandatoryRatingPanel({
  busy = false,
  errorMessage,
  onComplete
}: SitterMandatoryRatingPanelProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const canComplete = rating >= 1 && !busy;

  return (
    <div className="flex w-full shrink-0 flex-col items-center gap-4 px-2 py-2 text-center">
      <div className="space-y-1">
        <p className="text-lg font-bold text-[#001F3F]">המשמרת הסתיימה!</p>
        <p className="text-sm font-semibold text-navy-800">דרגי את המשפחה:</p>
      </div>

      <StarRatingInput value={rating} onChange={setRating} disabled={busy} />

      <label className="w-full max-w-[17rem] text-right">
        <span className="mb-1 block text-xs font-semibold text-slate-600">חוות דעת (לא חובה)</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 2000))}
          disabled={busy}
          rows={3}
          placeholder="ספרו בכמה מילים על החוויה שלכם..."
          className="w-full resize-none rounded-xl border border-navy-header/15 bg-white px-3 py-2 text-sm leading-snug text-[#001F3F] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#001F3F]/20"
        />
      </label>

      {errorMessage ? (
        <p className="max-w-[17rem] text-center text-xs font-medium text-rose-700">{errorMessage}</p>
      ) : null}

      <button
        type="button"
        disabled={!canComplete}
        onClick={() =>
          void onComplete(rating, comment.trim() ? comment.trim().slice(0, 2000) : null)
        }
        className="w-full max-w-[17rem] rounded-xl bg-[#001F3F] px-5 py-3 text-sm font-bold text-white shadow-md shadow-[#001F3F]/25 ring-1 ring-[#001F3F]/20 transition hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? "שומרים…" : "סיום וחזרה"}
      </button>
    </div>
  );
}
