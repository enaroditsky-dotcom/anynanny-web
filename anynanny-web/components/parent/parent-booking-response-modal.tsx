"use client";

import { CalendarCheck2, CalendarX2 } from "lucide-react";
import type { ParentBookingResponseNotification } from "@/lib/bookings/parent-booking-response-notifications";
import { parentBookingResponseMessage } from "@/lib/bookings/parent-booking-response-notifications";
import { formatBookingSchedule } from "@/lib/bookings/sitter-pending-bookings";

export type ParentBookingResponseModalProps = {
  notification: ParentBookingResponseNotification | null;
  busy?: boolean;
  onAcknowledge: () => void;
};

export function ParentBookingResponseModal({
  notification,
  busy = false,
  onAcknowledge
}: ParentBookingResponseModalProps) {
  if (!notification) return null;

  const { title, body, variant } = parentBookingResponseMessage(notification);
  const isSuccess = variant === "success";
  const scheduleLabel = formatBookingSchedule(notification);

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-[#001F3F]/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="parent-booking-response-title"
      aria-describedby="parent-booking-response-body"
    >
      <div
        className={`w-full max-w-sm rounded-3xl border-2 bg-[#FDFBF6] p-6 text-right shadow-2xl shadow-navy-header/15 ${
          isSuccess ? "border-emerald-300/80" : "border-rose-300/80"
        }`}
      >
        <div className="flex flex-row-reverse items-start gap-3">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm ring-1 ${
              isSuccess
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-rose-50 text-rose-700 ring-rose-200"
            }`}
          >
            {isSuccess ? (
              <CalendarCheck2 className="h-6 w-6" aria-hidden />
            ) : (
              <CalendarX2 className="h-6 w-6" aria-hidden />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h2
              id="parent-booking-response-title"
              className={`text-lg font-bold leading-snug ${
                isSuccess ? "text-emerald-950" : "text-rose-950"
              }`}
            >
              {title}
            </h2>
            <p
              id="parent-booking-response-body"
              className={`mt-2 text-sm leading-relaxed ${
                isSuccess ? "text-emerald-900/90" : "text-rose-900/90"
              }`}
            >
              {body}
            </p>
            <p className="mt-2 text-xs font-medium tabular-nums text-slate-600">{scheduleLabel}</p>
            {isSuccess ? (
              <p className="mt-1 text-xs leading-snug text-slate-500">
                המשמרת תופיע ביומן המשמרות שלך.
              </p>
            ) : (
              <p className="mt-1 text-xs leading-snug text-slate-500">
                ניתן לחפש בייביסיטר אחרת או לבקש מועד חדש.
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={onAcknowledge}
          className="mt-5 flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#001F3F] px-4 text-sm font-bold text-white shadow-md transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "שומר…" : "אישור"}
        </button>
      </div>
    </div>
  );
}
