"use client";

import { useParentBillingSession } from "@/lib/billing/use-parent-billing-session";
import { getPairedSitterUserId } from "@/lib/session/paired-sitter";

type ParentShiftPanelProps = {
  selectedSitterName: string;
  selectedHourlyRate?: number;
  className?: string;
};

export function ParentShiftPanel({
  selectedSitterName,
  selectedHourlyRate,
  className = ""
}: ParentShiftPanelProps) {
  const {
    sessionState,
    sessionRunning,
    waitingSitterStart,
    waitingParentEndConfirm,
    timerText,
    earnedNis,
    banner,
    setBanner,
    toast,
    actionPending,
    startShift,
    requestEnd,
    confirmEnd
  } = useParentBillingSession();

  const pairedSitterId = getPairedSitterUserId();

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-navy-900">משמרת בזמן אמת — Double-Shake</p>
          <p className="mt-0.5 text-xs text-navy-600">
            סיטר/ית נבחר/ת: <strong>{selectedSitterName}</strong>
            {selectedHourlyRate ? ` · ₪${selectedHourlyRate}/שעה` : null}
          </p>
        </div>
        {!pairedSitterId ? (
          <span className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">
            נדרש קישור בייביסיטר (dev pairing)
          </span>
        ) : null}
      </div>

      {banner ? (
        <div className="flex items-start justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="min-w-0 flex-1">{banner}</p>
          <button type="button" className="shrink-0 text-xs font-semibold underline" onClick={() => setBanner(null)}>
            סגור
          </button>
        </div>
      ) : null}

      {sessionRunning || sessionState.status === "ended" ? (
        <div className="rounded-xl border border-navy-100 bg-white p-3 text-sm">
          <p className="text-xs text-navy-600">
            {waitingSitterStart
              ? "ממתין לאישור הבייביסיטר…"
              : waitingParentEndConfirm
                ? "בקשת סיום נשלחה — אשרו סיום סופי"
                : sessionState.status === "ended"
                  ? "המשמרת האחרונה הסתיימה"
                  : "משמרת פעילה"}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-navy-900">{timerText}</p>
          <p className="font-semibold text-navy-800">סכום שנצבר: ₪{earnedNis}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!sessionRunning ? (
          <button
            type="button"
            disabled={actionPending || !pairedSitterId}
            onClick={() =>
              void startShift({
                sitterId: pairedSitterId ?? undefined,
                hourlyRate: selectedHourlyRate
              })
            }
            className="rounded-xl bg-[#001F3F] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            התחל משמרת
          </button>
        ) : waitingSitterStart ? (
          <button
            type="button"
            disabled
            className="cursor-wait rounded-xl bg-navy-700/80 px-4 py-2.5 text-sm font-semibold text-white"
          >
            ממתין לאישור בייביסיטר…
          </button>
        ) : waitingParentEndConfirm ? (
          <button
            type="button"
            disabled={actionPending}
            onClick={() => void confirmEnd()}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
          >
            אשר סיום משמרת
          </button>
        ) : sessionState.status === "active" ? (
          <button
            type="button"
            disabled={actionPending}
            onClick={() => void requestEnd()}
            className="rounded-xl bg-[#FF8A8A] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
          >
            סיום משמרת
          </button>
        ) : null}
      </div>

      {toast ? (
        <p role="status" className="text-xs font-medium text-emerald-700">
          {toast}
        </p>
      ) : null}
    </div>
  );
}
