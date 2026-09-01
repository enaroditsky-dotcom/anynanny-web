"use client";

import { Loader2 } from "lucide-react";
import {
  MANUAL_PAYMENT_METHOD_LABELS,
  SITTER_CONFIRM_RECEIVED_BUTTON,
  SITTER_DENY_RECEIVED_BUTTON,
  SITTER_MANUAL_PAYMENT_PROMPT
} from "@/lib/billing/manual-payment-ui";
import { isManualPaymentMethod } from "@/lib/billing/manual-payment-lifecycle";

export type SitterManualPaymentConfirmPanelProps = {
  amountNis?: number | null;
  paymentMethod?: string | null;
  busy?: boolean;
  errorMessage?: string | null;
  onConfirm: () => void;
  onDeny: () => void;
};

export function SitterManualPaymentConfirmPanel({
  amountNis,
  paymentMethod,
  busy = false,
  errorMessage,
  onConfirm,
  onDeny
}: SitterManualPaymentConfirmPanelProps) {
  const methodLabel = isManualPaymentMethod(paymentMethod)
    ? MANUAL_PAYMENT_METHOD_LABELS[paymentMethod]
    : null;
  const amountLabel =
    amountNis != null && Number.isFinite(amountNis) ? `₪${amountNis.toFixed(2)}` : null;

  return (
    <div className="flex w-full max-w-[18rem] flex-col items-center gap-4 px-2 py-2 text-center">
      <p className="text-base font-bold leading-snug text-[#001F3F]">
        {SITTER_MANUAL_PAYMENT_PROMPT}
      </p>
      {amountLabel || methodLabel ? (
        <div className="w-full space-y-0.5 text-sm text-slate-600">
          {amountLabel ? (
            <p>
              סכום: <span className="font-semibold tabular-nums text-[#001F3F]">{amountLabel}</span>
            </p>
          ) : null}
          {methodLabel ? (
            <p>
              אמצעי תשלום: <span className="font-semibold text-[#001F3F]">{methodLabel}</span>
            </p>
          ) : null}
        </div>
      ) : null}
      {errorMessage ? (
        <p className="text-xs font-medium text-rose-700">{errorMessage}</p>
      ) : null}
      <div className="flex w-full flex-col gap-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="inline-flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-md shadow-emerald-700/20 ring-1 ring-emerald-400/40 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {SITTER_CONFIRM_RECEIVED_BUTTON}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDeny}
          className="inline-flex min-h-[2.75rem] w-full items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {SITTER_DENY_RECEIVED_BUTTON}
        </button>
      </div>
    </div>
  );
}
