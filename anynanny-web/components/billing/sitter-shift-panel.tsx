"use client";

import { useSitterBillingSession } from "@/lib/billing/use-sitter-billing-session";

export function SitterShiftPanel() {
  const {
    pendingRow,
    activeShiftRow,
    endPendingRow,
    liveTimerText,
    liveEarned,
    banner,
    setBanner,
    confirmingStart,
    confirmStartShift
  } = useSitterBillingSession();

  return (
    <div className="flex w-full flex-1 flex-col gap-4">
      {banner ? (
        <div className="flex items-start justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="min-w-0 flex-1">{banner}</p>
          <button type="button" className="shrink-0 text-xs font-semibold underline" onClick={() => setBanner(null)}>
            סגור
          </button>
        </div>
      ) : null}

      {endPendingRow ? (
        <div className="w-full space-y-2 text-right">
          <p className="text-sm font-semibold text-[#001F3F]">ההורה ביקש לסיים את המשמרת</p>
          <p className="text-3xl font-bold tabular-nums text-navy-header">{liveTimerText}</p>
          <p className="text-sm font-semibold text-navy-800">סכום שנצבר: ₪{liveEarned}</p>
          <p className="text-xs text-slate-500">ממתינים לאישור סיום סופי מההורה.</p>
        </div>
      ) : pendingRow ? (
        <div className="w-full space-y-3 text-right">
          <div>
            <p className="text-sm font-semibold text-slate-700">משמרת חדשה ממתינה לאישור</p>
            <p className="text-xs text-slate-500">מזהה: {String(pendingRow.id).slice(0, 8)}…</p>
            {pendingRow.hourly_rate ? (
              <p className="text-xs text-slate-500">תעריף: ₪{Number(pendingRow.hourly_rate).toFixed(0)}/שעה</p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={confirmingStart}
            onClick={() => void confirmStartShift()}
            className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-base font-bold text-white shadow-md transition hover:brightness-105 active:brightness-95 disabled:opacity-70 sm:w-auto"
          >
            אשר תחילת משמרת
          </button>
        </div>
      ) : activeShiftRow ? (
        <div className="w-full space-y-2 text-right">
          <p className="text-sm font-semibold text-emerald-900">משמרת פעילה</p>
          <p className="text-3xl font-bold tabular-nums text-[#001F3F]">{liveTimerText}</p>
          <p className="text-sm font-semibold text-navy-800">סכום שנצבר: ₪{liveEarned}</p>
          <p className="text-xs text-slate-500">סיום המשמרת מתבצע מהצד של ההורה.</p>
        </div>
      ) : (
        <div className="py-2 text-right">
          <p className="text-sm text-slate-600">אין משמרת פעילה כרגע.</p>
          <p className="mt-1 text-xs text-slate-500">כשהורה יפתח משמרת, תופיע כאן בקשת אישור.</p>
        </div>
      )}
    </div>
  );
}
