"use client";

import { Loader2 } from "lucide-react";
import { formatElapsed } from "@/lib/session/protocol";

type PaymentSummaryOverlayProps = {
  elapsedSeconds: number;
  amountNis: number;
  processing: boolean;
  paymentComplete?: boolean;
  error?: string | null;
  onDismiss?: () => void;
};

export function PaymentSummaryOverlay({
  elapsedSeconds,
  amountNis,
  processing,
  paymentComplete = false,
  error,
  onDismiss
}: PaymentSummaryOverlayProps) {
  const timerText = formatElapsed(elapsedSeconds);
  const amountStr = amountNis.toFixed(2);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-summary-title"
    >
      <div className="w-full max-w-md rounded-3xl border border-navy-header/15 bg-white p-6 shadow-xl shadow-[#001F3F]/15">
        <div className="mb-5 text-center">
          <p
            id="payment-summary-title"
            className="text-lg font-bold text-[#001F3F]"
          >
            {paymentComplete ? "התשלום הושלם" : "סיכום משמרת"}
          </p>
          <p className="mt-1 text-sm text-navy-800/70">
            {paymentComplete
              ? "החיוב עבר בהצלחה דרך Stripe."
              : "להלן פירוט הזמן והעלות הסופיים."}
          </p>
        </div>

        <div className="space-y-3 rounded-2xl bg-[#001F3F] p-5 text-white shadow-[0_12px_40px_-10px_rgba(0,31,63,0.65)]">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-white/85">זמן עבודה</span>
            <span className="font-bold tabular-nums">{timerText}</span>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-white/15 pt-3 text-sm">
            <span className="font-semibold text-white/85">סה״כ לתשלום</span>
            <span className="text-xl font-bold tabular-nums">₪{amountStr}</span>
          </div>
        </div>

        {processing && !paymentComplete ? (
          <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-navy-header/10 bg-[#FDFBF6] px-4 py-3 text-sm font-semibold text-navy-header">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
            <span>מעבדים תשלום דרך Stripe…</span>
          </div>
        ) : null}

        {paymentComplete ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-900">
            התשלום אושר — תודה!
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-sm font-semibold text-rose-800">
            {error}
          </p>
        ) : null}

        {onDismiss && (paymentComplete || error) ? (
          <button
            type="button"
            onClick={onDismiss}
            className="mt-5 w-full rounded-xl bg-[#001F3F] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#001F3F]/25 ring-1 ring-[#001F3F]/20 transition hover:brightness-110 active:brightness-95"
          >
            סגירה
          </button>
        ) : null}
      </div>
    </div>
  );
}
