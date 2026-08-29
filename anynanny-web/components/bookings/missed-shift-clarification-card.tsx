"use client";

import { useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  formatMissedShiftClarificationBody,
  isMissedShiftClarificationStatus,
  isMissedShiftDisputedStatus,
  isMissedShiftHappenedUnverifiedStatus,
  MISSED_SHIFT_COPY,
  MISSED_SHIFT_REASON_CODES,
  MISSED_SHIFT_REASON_LABELS,
  missedShiftStatusLabel,
  reasonLabelForCode,
  type MissedShiftReasonCode
} from "@/lib/bookings/missed-shift-lifecycle";
import {
  submitMissedShiftReason,
  type MissedShiftBookingView
} from "@/lib/bookings/missed-shift-client";

export type MissedShiftClarificationCardProps = {
  booking: MissedShiftBookingView;
  role: "parent" | "sitter";
  onSubmitted?: (next: MissedShiftBookingView) => void;
};

export function MissedShiftClarificationCard({
  booking,
  role,
  onSubmitted
}: MissedShiftClarificationCardProps) {
  const ownReason = role === "parent" ? booking.parent_reason : booking.sitter_reason;
  const otherReason = role === "parent" ? booking.sitter_reason : booking.parent_reason;
  const awaitingOwn = isMissedShiftClarificationStatus(booking.status) && !ownReason;
  const [reason, setReason] = useState<MissedShiftReasonCode | "">(ownReason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const body = useMemo(() => formatMissedShiftClarificationBody(booking), [booking]);
  const statusLabel = missedShiftStatusLabel(booking.status);

  const handleSubmit = async () => {
    if (!reason || busy) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("לא ניתן לשמור כרגע.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await submitMissedShiftReason(supabase, booking.id, reason);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const next: MissedShiftBookingView = {
      ...booking,
      status: result.status as MissedShiftBookingView["status"],
      parent_reason: result.parent_reason,
      sitter_reason: result.sitter_reason
    };
    onSubmitted?.(next);
  };

  return (
    <div className="w-full space-y-3 text-right" dir="rtl">
      <p className="text-sm font-bold text-rose-950">{MISSED_SHIFT_COPY.title}</p>
      <p className="text-xs leading-relaxed text-rose-900/90">{body}</p>
      <p className="text-xs font-semibold text-rose-950">{MISSED_SHIFT_COPY.choosePrompt}</p>

      {awaitingOwn ? (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700" htmlFor={`missed-shift-reason-${booking.id}`}>
            {MISSED_SHIFT_COPY.selectReason}
          </label>
          <select
            id={`missed-shift-reason-${booking.id}`}
            className="w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm text-slate-900"
            value={reason}
            onChange={(event) => setReason(event.target.value as MissedShiftReasonCode | "")}
            disabled={busy}
          >
            <option value="">{MISSED_SHIFT_COPY.selectReason}</option>
            {MISSED_SHIFT_REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {MISSED_SHIFT_REASON_LABELS[code]}
              </option>
            ))}
          </select>
          {error ? <p className="text-xs text-rose-700">{error}</p> : null}
          <button
            type="button"
            disabled={!reason || busy}
            onClick={() => void handleSubmit()}
            className="inline-flex w-full items-center justify-center rounded-xl bg-rose-800 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? MISSED_SHIFT_COPY.submitting : MISSED_SHIFT_COPY.submit}
          </button>
        </div>
      ) : (
        <div className="space-y-1 rounded-xl border border-rose-100 bg-white/70 px-3 py-2 text-xs text-rose-950">
          {ownReason ? (
            <p>
              הדיווח שלך: {reasonLabelForCode(ownReason)}
            </p>
          ) : null}
          {isMissedShiftClarificationStatus(booking.status) ? (
            <p className="font-semibold">{MISSED_SHIFT_COPY.alreadySubmitted}</p>
          ) : null}
          {statusLabel ? (
            <p className="font-bold">
              סטטוס: {statusLabel}
              {otherReason && !isMissedShiftClarificationStatus(booking.status)
                ? ` · ${reasonLabelForCode(otherReason)}`
                : ""}
            </p>
          ) : null}
          {isMissedShiftHappenedUnverifiedStatus(booking.status) ? (
            <p>המשמרת ממתינה לאימות נפרד לפני תשלום או השלמה.</p>
          ) : null}
          {isMissedShiftDisputedStatus(booking.status) ? (
            <p>הדיווחים סותרים ונשמרו לבירור. לא יבוצע תשלום אוטומטי.</p>
          ) : null}
        </div>
      )}

      <p className="text-[11px] leading-snug text-rose-800/80">{MISSED_SHIFT_COPY.footer}</p>
    </div>
  );
}
