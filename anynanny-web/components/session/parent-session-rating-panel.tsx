"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { StarRatingInput } from "@/components/session/star-rating-input";

type ParentSessionRatingPanelProps = {
  sitterName: string;
  busy?: boolean;
  errorMessage?: string | null;
  onSubmitRating: (rating: number) => void | Promise<void>;
};

/** Parent post-shift rating step (required before HYP payment). */
export function ParentSessionRatingPanel({
  sitterName,
  busy = false,
  errorMessage,
  onSubmitRating
}: ParentSessionRatingPanelProps) {
  const [rating, setRating] = useState(0);
  const canSubmit = rating >= 1 && !busy;

  return (
    <div className="flex w-full shrink-0 flex-col items-center">
      <div className="w-full max-w-[14rem] rounded-xl bg-[#001F3F] px-2 py-1.5 shadow-[0_6px_20px_-6px_rgba(0,31,63,0.5)] ring-1 ring-[#001F3F]/20">
        <div className="flex flex-col items-center gap-0.5 text-center">
          <p className="text-[11px] font-bold leading-snug text-white">
            {`איך הייתה המשמרת עם ${sitterName}?`}
          </p>
          <p className="mb-0.5 text-[9px] font-medium text-white/75">הדירוג עוזר לקהילה</p>

          <StarRatingInput value={rating} onChange={setRating} disabled={busy} size="sm" />

          {errorMessage ? (
            <p className="max-w-full text-[9px] font-medium leading-snug text-rose-300">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void onSubmitRating(rating)}
            className="mt-0.5 w-full rounded-lg bg-emerald-600 px-2.5 py-2 text-[11px] font-bold text-white ring-1 ring-emerald-300/50 transition hover:bg-emerald-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? (
              <span className="inline-flex items-center justify-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                שולחים…
              </span>
            ) : (
              "שליחת דירוג"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
