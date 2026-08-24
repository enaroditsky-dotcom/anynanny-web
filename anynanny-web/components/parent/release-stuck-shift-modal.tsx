"use client";

import { useEffect, useId, useState } from "react";
import {
  RELEASE_STUCK_SHIFT_COPY,
  RELEASE_STUCK_SHIFT_REASON_OTHER,
  RELEASE_STUCK_SHIFT_REASONS,
  canSubmitReleaseStuckShiftReason,
  type ReleaseStuckShiftReasonId
} from "@/lib/bookings/release-displayed-stuck-shift";

type ReleaseStuckShiftModalProps = {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  warning?: string;
  onClose: () => void;
  onConfirm: (reasonId: ReleaseStuckShiftReasonId, detail: string) => void;
};

export function ReleaseStuckShiftModal({
  open,
  busy = false,
  error = null,
  warning,
  onClose,
  onConfirm
}: ReleaseStuckShiftModalProps) {
  const titleId = useId();
  const [reasonId, setReasonId] = useState<ReleaseStuckShiftReasonId | null>(null);
  const [detail, setDetail] = useState("");

  useEffect(() => {
    if (!open) return;
    setReasonId(null);
    setDetail("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const canConfirm = canSubmitReleaseStuckShiftReason(reasonId, detail) && !busy;

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
          {RELEASE_STUCK_SHIFT_COPY.title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          {warning ?? RELEASE_STUCK_SHIFT_COPY.warning}
        </p>

        <fieldset className="mt-4 space-y-2" disabled={busy}>
          <legend className="mb-2 text-sm font-semibold text-navy-header">בחרו סיבה</legend>
          {RELEASE_STUCK_SHIFT_REASONS.map((reason) => {
            const inputId = `${titleId}-${reason.id}`;
            return (
              <label
                key={reason.id}
                htmlFor={inputId}
                className="flex cursor-pointer items-start gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-navy-header"
              >
                <input
                  id={inputId}
                  type="radio"
                  name={`${titleId}-reason`}
                  value={reason.id}
                  checked={reasonId === reason.id}
                  disabled={busy}
                  onChange={() => setReasonId(reason.id)}
                  className="mt-0.5"
                />
                <span>{reason.label}</span>
              </label>
            );
          })}
        </fieldset>

        {reasonId === RELEASE_STUCK_SHIFT_REASON_OTHER ? (
          <div className="mt-3">
            <label htmlFor={`${titleId}-detail`} className="block text-sm font-semibold text-navy-header">
              {RELEASE_STUCK_SHIFT_COPY.detailLabel}
            </label>
            <textarea
              id={`${titleId}-detail`}
              value={detail}
              required
              disabled={busy}
              maxLength={280}
              placeholder={RELEASE_STUCK_SHIFT_COPY.detailPlaceholder}
              onChange={(event) => setDetail(event.target.value)}
              className="mt-1.5 min-h-[5rem] w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-navy-header outline-none ring-navy-header/20 focus:ring-2 disabled:opacity-60"
            />
          </div>
        ) : null}

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
            {RELEASE_STUCK_SHIFT_COPY.cancel}
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              if (!reasonId || !canConfirm) return;
              onConfirm(reasonId, detail.trim());
            }}
            className="rounded-xl bg-amber-700 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-amber-800 disabled:opacity-60"
          >
            {busy ? RELEASE_STUCK_SHIFT_COPY.confirming : RELEASE_STUCK_SHIFT_COPY.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
