"use client";

import { useId } from "react";
import {
  CANCELLATION_COPY,
  formatCancellationShiftWhen,
  type CancellationShiftLike
} from "@/lib/bookings/cancellation-request";

type ShiftCancellationApproveModalProps = {
  open: boolean;
  shift: CancellationShiftLike | null;
  partnerName: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function ShiftCancellationApproveModal({
  open,
  shift,
  partnerName,
  busy = false,
  error = null,
  onClose,
  onConfirm
}: ShiftCancellationApproveModalProps) {
  const titleId = useId();

  if (!open || !shift) return null;

  const whenLabel = formatCancellationShiftWhen(shift);

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
          {CANCELLATION_COPY.approveConfirmTitle}
        </h2>
        <p className="mt-2 text-sm font-semibold tabular-nums text-navy-header">{whenLabel}</p>
        <p className="mt-0.5 text-sm font-medium text-slate-600">{partnerName}</p>

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
            onClick={onConfirm}
            className="rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
          >
            {busy ? CANCELLATION_COPY.approving : CANCELLATION_COPY.approveConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
