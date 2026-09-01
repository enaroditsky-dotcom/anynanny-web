"use client";

import { Banknote, Copy, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  eligibleManualPaymentMethods,
  MANUAL_PAYMENT_CASH_COPY,
  MANUAL_PAYMENT_HEADING,
  MANUAL_PAYMENT_METHOD_LABELS,
  MANUAL_PAYMENT_PAID_BUTTON,
  manualPaymentDestinationInstruction,
  manualPaymentMethodTitle,
  type ManualPaymentDestinations
} from "@/lib/billing/manual-payment-ui";
import type { ManualPaymentMethod } from "@/lib/billing/manual-payment-lifecycle";
import { formatElapsed } from "@/lib/session/protocol";

export type ManualPaymentPanelProps = {
  elapsedSeconds: number;
  sitterBaseNis: number;
  destinations: ManualPaymentDestinations | null;
  destinationsLoading?: boolean;
  selectedMethod: ManualPaymentMethod | null;
  onSelectMethod: (method: ManualPaymentMethod) => void;
  busy?: boolean;
  bookingReady?: boolean;
  errorMessage?: string | null;
  onReportPaid: () => void;
};

export function ManualPaymentPanel({
  elapsedSeconds,
  sitterBaseNis,
  destinations,
  destinationsLoading = false,
  selectedMethod,
  onSelectMethod,
  busy = false,
  bookingReady = true,
  errorMessage,
  onReportPaid
}: ManualPaymentPanelProps) {
  const [copied, setCopied] = useState(false);
  const methods = useMemo(
    () =>
      eligibleManualPaymentMethods({
        bitConfigured: destinations?.bit.available === true,
        payboxConfigured: destinations?.paybox.available === true
      }),
    [destinations]
  );
  const timerText = formatElapsed(elapsedSeconds);
  const destination =
    selectedMethod === "bit"
      ? destinations?.bit.destination
      : selectedMethod === "paybox"
        ? destinations?.paybox.destination
        : null;
  const canReport =
    Boolean(selectedMethod) && !busy && bookingReady && !destinationsLoading;

  const copyDestination = async () => {
    if (!destination || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(destination.replace(/-/g, ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex w-full shrink-0 flex-col items-stretch">
      <div className="w-full rounded-2xl bg-[#001F3F] px-4 py-5 shadow-[0_8px_28px_-8px_rgba(0,31,63,0.55)] ring-1 ring-[#001F3F]/25 sm:px-5 sm:py-6">
        <div className="flex w-full flex-col gap-4 text-center">
          <div className="space-y-2">
            <p className="text-base font-bold leading-snug text-white sm:text-lg">
              המשמרת הסתיימה!
            </p>
            <p className="text-sm font-semibold tabular-nums leading-snug text-white/95">
              {timerText}
            </p>
            <p className="text-xs font-semibold text-white/80">סכום לתשלום לנני</p>
            <p className="text-3xl font-extrabold tabular-nums tracking-tight text-emerald-300 sm:text-4xl">
              ₪{sitterBaseNis.toFixed(2)}
            </p>
          </div>

          <div className="w-full border-t border-white/15" aria-hidden />

          <div className="w-full space-y-3 text-right">
            <p className="text-center text-sm font-bold text-white">{MANUAL_PAYMENT_HEADING}</p>

            {destinationsLoading ? (
              <div className="flex items-center justify-center gap-2 py-2 text-xs text-white/70">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                <span>טוענים אמצעי תשלום…</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {methods.map((id) => {
                  const selected = selectedMethod === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={busy || !bookingReady}
                      onClick={() => onSelectMethod(id)}
                      className={`flex min-h-[3.5rem] w-full flex-row-reverse items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-sm font-bold transition ${
                        selected
                          ? "border-emerald-300 bg-emerald-600/30 text-white ring-1 ring-emerald-300/60"
                          : "border-white/15 bg-white/5 text-white/90 hover:border-white/30 hover:bg-white/10"
                      } disabled:cursor-not-allowed disabled:opacity-45`}
                    >
                      <Banknote className="h-5 w-5 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 text-right text-[17px] leading-tight">
                        {MANUAL_PAYMENT_METHOD_LABELS[id]}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedMethod ? (
            <div className="space-y-2 rounded-xl border border-white/15 bg-white/5 px-3.5 py-3 text-right">
              <p className="text-sm font-bold text-white">
                {manualPaymentMethodTitle(selectedMethod)}
              </p>
              {selectedMethod === "cash" ? (
                <p className="text-[13px] font-medium leading-snug text-white/75">
                  {MANUAL_PAYMENT_CASH_COPY}
                </p>
              ) : (
                <>
                  <p className="text-[13px] font-medium leading-snug text-white/75">
                    {manualPaymentDestinationInstruction(selectedMethod)}
                  </p>
                  {destination ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-white/10 px-3 py-2">
                      <p className="font-mono text-base font-bold tracking-wide text-emerald-200" dir="ltr">
                        {destination}
                      </p>
                      <button
                        type="button"
                        onClick={() => void copyDestination()}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-white/85 hover:bg-white/10"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                        {copied ? "הועתק" : "העתקה"}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {errorMessage ? (
            <p className="max-w-full text-center text-xs font-medium leading-snug text-rose-300">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="button"
            disabled={!canReport}
            onClick={onReportPaid}
            className="mt-1 w-full rounded-xl bg-emerald-600 px-4 py-3.5 text-base font-bold text-white shadow-[0_6px_18px_-6px_rgba(16,185,129,0.65)] ring-1 ring-emerald-300/50 transition hover:bg-emerald-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy ? "מדווחים…" : MANUAL_PAYMENT_PAID_BUTTON}
          </button>
        </div>
      </div>
    </div>
  );
}
