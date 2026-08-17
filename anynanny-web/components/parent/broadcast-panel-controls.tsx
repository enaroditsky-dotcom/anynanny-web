"use client";

import { ArrowLeft, ChevronUp, X } from "lucide-react";

const CONTROL_CLASS =
  "inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-slate-600 transition hover:bg-white/80 hover:text-slate-900";

type BroadcastPanelControlsProps = {
  /** Active/paused radar only. Omit on the start page. */
  onMinimize?: () => void;
  minimizeDisabled?: boolean;
  /** Start screen only: back without changing broadcast state. */
  onBack?: () => void;
  /** Paused screen only: permanently close this finished broadcast UI. */
  onClose?: () => void;
  closeDisabled?: boolean;
};

/**
 * Shared top row for Broadcast screens.
 * Visual language matches DashboardStatusCard: "צמצם" + up chevron.
 *
 * ACTIVE radar: only צמצם (no back, no X)
 * START page: חזור only (no צמצם)
 * PAUSED radar: X + צמצם
 */
export function BroadcastPanelControls({
  onMinimize,
  minimizeDisabled = false,
  onBack,
  onClose,
  closeDisabled = false
}: BroadcastPanelControlsProps) {
  return (
    <div className="mb-1 flex w-full items-center justify-between gap-2" dir="ltr">
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          disabled={closeDisabled}
          aria-label="סגור את השידור"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white/90 text-slate-600 shadow-sm transition hover:bg-white hover:text-slate-900 disabled:opacity-50"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : onBack ? (
        <button
          type="button"
          onClick={onBack}
          className={CONTROL_CLASS}
          aria-label="חזור"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          <span dir="rtl">חזור</span>
        </button>
      ) : (
        <span className="h-8 w-8" aria-hidden />
      )}

      {onMinimize ? (
        <button
          type="button"
          onClick={onMinimize}
          disabled={minimizeDisabled}
          aria-label="צמצם"
          className={`${CONTROL_CLASS} disabled:opacity-50`}
        >
          <span dir="rtl">צמצם</span>
          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : (
        <span className="h-8 w-8" aria-hidden />
      )}
    </div>
  );
}
