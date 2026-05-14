"use client";

import { formatElapsed } from "@/lib/session/protocol";
import { SESSION_ACTION_CIRCLE_STYLE, SESSION_CIRCLE_SHELL_CLASS } from "@/lib/session/session-circle";

type SessionFinalSummaryProps = {
  elapsedSeconds: number;
  amountNis: number;
  onDismiss: () => void;
};

/**
 * Post-completion summary inside the standard session circle + dismiss control.
 * Copy and layout are identical on parent and sitter dashboards.
 */
export function SessionFinalSummary({ elapsedSeconds, amountNis, onDismiss }: SessionFinalSummaryProps) {
  const timerText = formatElapsed(elapsedSeconds);
  const amountStr = amountNis.toFixed(2);

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div
        style={SESSION_ACTION_CIRCLE_STYLE}
        className={`${SESSION_CIRCLE_SHELL_CLASS} gap-1 bg-[#001F3F] shadow-[0_12px_40px_-10px_rgba(0,31,63,0.65)] ring-[#001F3F]/25`}
      >
        <div className="flex max-h-full w-full flex-col items-center justify-center gap-1.5 overflow-y-auto px-2 py-1 text-center">
          <p className="text-sm font-bold leading-tight text-white">המשמרת הסתיימה!</p>
          <p className="text-xs font-semibold tabular-nums leading-snug text-white/95">סה״כ זמן: {timerText}</p>
          <p className="text-xs font-semibold leading-snug text-white/95">סה״כ לתשלום: {amountStr} ₪</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-xl bg-[#001F3F] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#001F3F]/25 ring-1 ring-[#001F3F]/20 transition hover:brightness-110 active:brightness-95"
      >
        לחץ לסיום וסגירה
      </button>
    </div>
  );
}
