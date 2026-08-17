"use client";

import { formatElapsed } from "@/lib/session/protocol";
import {
  SESSION_ACTION_CIRCLE_STYLE,
  SESSION_CIRCLE_INNER_CLASS,
  SESSION_CIRCLE_SHELL_CLASS,
  SESSION_CIRCLE_SIZE_CLASS
} from "@/lib/session/session-circle";

type SessionFinalSummaryProps = {
  elapsedSeconds: number;
  amountNis: number;
  onDismiss: () => void;
  /** Parent-only: open Stripe Checkout for the linked booking. */
  payAvailable?: boolean;
  payBusy?: boolean;
  onPay?: () => void;
  /** When known (e.g. after webhook), show a short status under the amount. */
  paymentStatusLabel?: string | null;
};

/**
 * Post-completion summary inside the standard session circle + dismiss control.
 * Copy and layout are identical on parent and sitter dashboards.
 */
export function SessionFinalSummary({
  elapsedSeconds,
  amountNis,
  onDismiss,
  payAvailable = false,
  payBusy = false,
  onPay,
  paymentStatusLabel
}: SessionFinalSummaryProps) {
  const timerText = formatElapsed(elapsedSeconds);
  const amountStr = amountNis.toFixed(2);

  return (
    <div className="flex w-full shrink-0 flex-col items-center gap-4">
      <div
        style={SESSION_ACTION_CIRCLE_STYLE}
        className={`${SESSION_CIRCLE_SIZE_CLASS} ${SESSION_CIRCLE_SHELL_CLASS} shrink-0 gap-1 bg-[#001F3F] shadow-[0_12px_40px_-10px_rgba(0,31,63,0.65)] ring-[#001F3F]/25`}
      >
        <div className={SESSION_CIRCLE_INNER_CLASS}>
          <p className="text-sm font-bold leading-tight text-white">המשמרת הסתיימה!</p>
          <p className="text-xs font-semibold tabular-nums leading-snug text-white/95">סה״כ זמן: {timerText}</p>
          <p className="text-xs font-semibold leading-snug text-white/95">סה״כ לתשלום: {amountStr} ₪</p>
          {paymentStatusLabel ? (
            <p className="text-[13px] font-semibold leading-snug text-emerald-200">{paymentStatusLabel}</p>
          ) : null}
        </div>
      </div>
      {payAvailable && onPay ? (
        <button
          type="button"
          disabled={payBusy}
          onClick={() => {
            onPay();
          }}
          className="w-full max-w-[17rem] rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-bold text-white shadow-md backdrop-blur-sm transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {payBusy ? "פותחים תשלום מאובטח…" : "מעבר לתשלום מאובטח (Stripe)"}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => {
          onDismiss();
        }}
        className="rounded-xl bg-[#001F3F] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#001F3F]/25 ring-1 ring-[#001F3F]/20 transition hover:brightness-110 active:brightness-95"
      >
        סיום וסגירה
      </button>
    </div>
  );
}
