"use client";

import { useId } from "react";
import { X } from "lucide-react";
import { CANCELLATION_COPY, formatCancellationShiftWhen } from "@/lib/bookings/cancellation-request";
import type { CancellationAttentionItem } from "@/lib/bookings/cancellation-attention";

type ShiftCancellationApprovedModalProps = {
  open: boolean;
  item: CancellationAttentionItem | null;
  busy?: boolean;
  error?: string | null;
  onAcknowledge: () => void;
};

export function ShiftCancellationApprovedModal({
  open,
  item,
  busy = false,
  error = null,
  onAcknowledge
}: ShiftCancellationApprovedModalProps) {
  const titleId = useId();
  if (!open || !item) return null;

  const whenLabel = formatCancellationShiftWhen(item);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-[#001F3F]/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl border border-rose-100 bg-[#FDFBF6] p-5 text-right shadow-2xl"
        dir="rtl"
      >
        <button
          type="button"
          aria-label="סגירה"
          disabled={busy}
          onClick={onAcknowledge}
          className="absolute left-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:opacity-50"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>

        <h2 id={titleId} className="pl-10 text-lg font-bold text-navy-header">
          {CANCELLATION_COPY.approvedTitle}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{CANCELLATION_COPY.approvedBody}</p>
        <p className="mt-3 text-sm font-semibold text-navy-header">{item.partnerName}</p>
        <p className="mt-0.5 text-sm font-medium tabular-nums text-slate-600">{whenLabel}</p>
        <p className="mt-4 text-sm font-semibold text-rose-800">{CANCELLATION_COPY.closeHint}</p>

        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
            {error}
          </p>
        ) : null}

        {busy ? (
          <p className="mt-3 text-xs text-slate-500">{CANCELLATION_COPY.acknowledging}</p>
        ) : null}
      </div>
    </div>
  );
}
