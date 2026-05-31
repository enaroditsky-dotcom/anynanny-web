"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { StarRatingInput } from "@/components/session/star-rating-input";
import { formatElapsed } from "@/lib/session/protocol";

type ParentSessionClosurePanelProps = {
  elapsedSeconds: number;
  amountNis: number;
  busy?: boolean;
  bookingChecking?: boolean;
  bookingReady?: boolean;
  errorMessage?: string | null;
  onConfirmAndPay: (rating: number) => void | Promise<void>;
};

/** Parent post-shift closure — mandatory star rating before payment (fits locked 100dvh). */
export function ParentSessionClosurePanel({
  elapsedSeconds,
  amountNis,
  busy = false,
  bookingChecking = false,
  bookingReady = true,
  errorMessage,
  onConfirmAndPay
}: ParentSessionClosurePanelProps) {
  const [rating, setRating] = useState(0);
  const timerText = formatElapsed(elapsedSeconds);
  const amountStr = amountNis.toFixed(2);
  const canConfirm = rating >= 1 && !busy && bookingReady && !bookingChecking;
  const showError = bookingReady && !bookingChecking && Boolean(errorMessage);

  return (
    <div className="flex w-full shrink-0 flex-col items-center">
      <div className="w-full max-w-[14rem] rounded-xl bg-[#001F3F] px-2 py-1.5 shadow-[0_6px_20px_-6px_rgba(0,31,63,0.5)] ring-1 ring-[#001F3F]/20">
        <div className="flex flex-col items-center gap-0.5 text-center">
          <p className="text-[11px] font-bold leading-tight text-white">המשמרת הסתיימה!</p>
          <p className="text-[10px] font-semibold tabular-nums leading-snug text-white/95">
            {timerText} · {amountStr} ₪
          </p>

          <div className="w-full border-t border-white/10 pt-1">
            <p className="mb-0.5 text-[10px] font-semibold text-white/90">דרגו את הבייביסיטר</p>
            <StarRatingInput
              value={rating}
              onChange={setRating}
              disabled={busy || bookingChecking || !bookingReady}
              size="sm"
            />
          </div>

          {bookingChecking ? (
            <div className="flex items-center justify-center gap-1.5 py-0.5 text-[10px] text-white/70" aria-live="polite">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              <span>מאמתים פרטי משמרת…</span>
            </div>
          ) : null}

          {showError ? (
            <p className="max-w-full text-[9px] font-medium leading-snug text-rose-300">{errorMessage}</p>
          ) : null}

          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => void onConfirmAndPay(rating)}
            className="mt-0.5 w-full rounded-lg bg-emerald-600 px-2.5 py-2 text-[11px] font-bold text-white ring-1 ring-emerald-300/50 transition hover:bg-emerald-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? "מעבדים…" : "אישור ותשלום"}
          </button>
        </div>
      </div>
    </div>
  );
}
