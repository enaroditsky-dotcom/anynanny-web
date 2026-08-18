"use client";

import { useEffect, useId, useState } from "react";
import {
  CANCELLATION_COPY,
  CANCELLATION_MESSAGE_MAX_LENGTH,
  formatCancellationShiftWhen,
  sanitizeCancellationMessage,
  type CancellationShiftLike
} from "@/lib/bookings/cancellation-request";

type ShiftCancellationRequestModalProps = {
  open: boolean;
  shift: CancellationShiftLike | null;
  partnerName: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (message: string | null) => void;
};

export function ShiftCancellationRequestModal({
  open,
  shift,
  partnerName,
  busy = false,
  error = null,
  onClose,
  onSubmit
}: ShiftCancellationRequestModalProps) {
  const titleId = useId();
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (open) setMessage("");
  }, [open, shift?.id]);

  if (!open || !shift) return null;

  const whenLabel = formatCancellationShiftWhen(shift);
  const remaining = CANCELLATION_MESSAGE_MAX_LENGTH - message.length;

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-[#001F3F]/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="w-full max-w-sm rounded-3xl border border-slate-200 bg-[#FDFBF6] p-5 text-right shadow-2xl"
        dir="rtl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-bold text-navy-header">
          {CANCELLATION_COPY.modalTitle}
        </h2>
        <p className="mt-2 text-sm font-semibold tabular-nums text-navy-header">{whenLabel}</p>
        <p className="mt-0.5 text-sm font-medium text-slate-600">{partnerName}</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{CANCELLATION_COPY.explanation}</p>

        <label htmlFor={`${titleId}-message`} className="mt-4 block text-sm font-semibold text-navy-header">
          {CANCELLATION_COPY.messageLabel}
        </label>
        <textarea
          id={`${titleId}-message`}
          value={message}
          maxLength={CANCELLATION_MESSAGE_MAX_LENGTH}
          disabled={busy}
          placeholder={CANCELLATION_COPY.messagePlaceholder}
          onChange={(event) => setMessage(event.target.value.replace(/<[^>]*>/g, ""))}
          className="mt-1.5 min-h-[7rem] w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-navy-header outline-none ring-navy-header/20 focus:ring-2 disabled:opacity-60"
        />
        <p className="mt-1 text-xs text-slate-400">{remaining} תווים נותרו · אופציונלי</p>

        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {CANCELLATION_COPY.back}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSubmit(sanitizeCancellationMessage(message))}
            className="rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
          >
            {busy ? CANCELLATION_COPY.submitting : CANCELLATION_COPY.submit}
          </button>
        </div>
      </div>
    </div>
  );
}
