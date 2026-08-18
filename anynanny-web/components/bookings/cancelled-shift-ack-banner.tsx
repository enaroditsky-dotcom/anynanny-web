"use client";

import { X } from "lucide-react";
import { CANCELLATION_COPY } from "@/lib/bookings/cancellation-request";

export function CancelledShiftAckBanner({
  onAcknowledge,
  busy = false,
  error = null
}: {
  onAcknowledge: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  return (
    <div className="mt-3 space-y-2 border-t border-rose-100 pt-3 text-right">
      <div className="flex flex-row-reverse items-start justify-between gap-3">
        <button
          type="button"
          aria-label="סגירה"
          disabled={busy}
          onClick={onAcknowledge}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:opacity-50"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-rose-900">{CANCELLATION_COPY.approvedTitle}</p>
          <p className="mt-0.5 text-xs font-medium text-slate-600">{CANCELLATION_COPY.closeHint}</p>
        </div>
      </div>
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
