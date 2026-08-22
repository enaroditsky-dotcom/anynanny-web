"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { Calendar, CheckCircle2, Clock, X } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { createBooking } from "@/lib/bookings/create-booking";
import { dispatchNewBookingCreated } from "@/lib/bookings/new-booking-reset";
import {
  formatRequestedShiftDateLabel,
  formatRequestedShiftTimeRange,
  validateRequestedShiftWindow,
  type RequestedShiftWindow
} from "@/lib/bookings/requested-shift";
import { PARENT_SEARCH_HOUR_OPTIONS } from "@/lib/sitter/parent-search-filters";
import {
  SITTER_PROFILES_TABLE,
  SITTER_PROFILES_USER_COLUMN
} from "@/lib/sitter/sitter-profile";
import {
  BOOK_SHIFT_MINUTE_OPTIONS,
  validateShiftWindow
} from "@/lib/shift-requests/create-shift-request";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type BookShiftModalProps = {
  open: boolean;
  sitterId: string;
  sitterName: string;
  /**
   * Authoritative shift from parent search. When set, date/time are confirmation-only
   * and booking insert uses these exact timestamps.
   */
  requestedShift?: RequestedShiftWindow | null;
  onClose: () => void;
  onSuccess?: (bookingId: string) => void;
};

const SUCCESS_MESSAGE = "הבקשה נשלחה בהצלחה לבייביסיטר!";

export function BookShiftModal({
  open,
  sitterId,
  sitterName,
  requestedShift = null,
  onClose,
  onSuccess
}: BookShiftModalProps) {
  const { user } = useAuth();
  const lockedShift = requestedShift;

  const [bookingDate, setBookingDate] = useState("");
  const [endBookingDate, setEndBookingDate] = useState("");
  const [startHour, setStartHour] = useState("");
  const [startMinute, setStartMinute] = useState("");
  const [endHour, setEndHour] = useState("");
  const [endMinute, setEndMinute] = useState("");

  const [sitterHourlyRate, setSitterHourlyRate] = useState<number | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open || !sitterId) {
      return;
    }

    let cancelled = false;

    setSitterHourlyRate(null);
    setRateLoading(true);

    const fetchSitterRate = async () => {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (!cancelled) {
          setError("Supabase לא זמין");
          setRateLoading(false);
        }
        return;
      }

      try {
        const { data, error: rateError } = await supabase
          .from(SITTER_PROFILES_TABLE)
          .select("hourly_rate_nis")
          .eq(SITTER_PROFILES_USER_COLUMN, sitterId)
          .maybeSingle();

        if (cancelled) {
          return;
        }

        if (rateError) {
          console.warn("[BookShiftModal] sitter rate:", rateError.message);
          setSitterHourlyRate(null);
          setError("לא ניתן לטעון כרגע את תעריף הבייביסיטר.");
          return;
        }

        const rate = Number(data?.hourly_rate_nis);

        if (!Number.isFinite(rate) || rate <= 0) {
          setSitterHourlyRate(null);
          setError("לבייביסיטר עדיין לא מוגדר תעריף שעתי תקין.");
          return;
        }

        setSitterHourlyRate(rate);
        setError(null);
      } catch (err) {
        console.warn("[BookShiftModal] sitter rate exception:", err);
        if (!cancelled) {
          setSitterHourlyRate(null);
          setError("לא ניתן לטעון כרגע את תעריף הבייביסיטר.");
        }
      } finally {
        if (!cancelled) {
          setRateLoading(false);
        }
      }
    };

    void fetchSitterRate();

    return () => {
      cancelled = true;
    };
  }, [open, sitterId]);

  const resetForm = useCallback(() => {
    setBookingDate("");
    setEndBookingDate("");
    setStartHour("");
    setStartMinute("");
    setEndHour("");
    setEndMinute("");
    setError(null);
    setSuccess(false);
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    resetForm();
  }, [open, resetForm]);

  const handleClose = useCallback(() => {
    if (busy) {
      return;
    }
    onClose();
  }, [busy, onClose]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user?.id) {
      setError("יש להתחבר כדי לשלוח בקשה");
      return;
    }

    if (sitterHourlyRate == null || !Number.isFinite(sitterHourlyRate) || sitterHourlyRate <= 0) {
      setError("לא ניתן לשלוח את הבקשה עד לטעינת תעריף הבייביסיטר.");
      return;
    }

    const validated = lockedShift
      ? validateRequestedShiftWindow(lockedShift)
      : validateShiftWindow({
          shiftDate: bookingDate,
          shiftEndDate: endBookingDate,
          startHour,
          startMinute,
          endHour,
          endMinute
        });

    if ("error" in validated) {
      setError(validated.error);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase לא זמין");
      return;
    }

    setBusy(true);

    const { booking, error: insertError } = await createBooking(supabase, user.id, {
      sitterId,
      bookingDate: validated.startDate,
      endBookingDate: validated.endDate,
      startIso: lockedShift ? lockedShift.startIso : validated.startIso,
      endIso: lockedShift ? lockedShift.endIso : validated.endIso,
      hourlyRateNis: sitterHourlyRate,
      bookingSource: "direct"
    });

    setBusy(false);

    if (insertError || !booking) {
      setError(insertError ?? "לא ניתן לשלוח את הבקשה");
      return;
    }

    setSuccess(true);
    dispatchNewBookingCreated({
      bookingId: booking.id,
      parentId: user.id,
      sitterId
    });
    onSuccess?.(booking.id);
  };

  if (!open) {
    return null;
  }

  const minDate = new Date().toISOString().slice(0, 10);
  const lockedDateLabel = lockedShift ? formatRequestedShiftDateLabel(lockedShift.startDate) : "";
  const lockedTimeLabel = lockedShift
    ? formatRequestedShiftTimeRange(lockedShift.startIso, lockedShift.endIso)
    : "";
  const lockedEndDateLabel =
    lockedShift && lockedShift.endDate !== lockedShift.startDate
      ? formatRequestedShiftDateLabel(lockedShift.endDate)
      : null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/50 p-4 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="book-shift-title"
      dir="rtl"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-navy-header/12 bg-white p-5 shadow-2xl shadow-[#001F3F]/20"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex flex-row-reverse items-start justify-between gap-3 border-b border-navy-header/8 pb-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
            aria-label="סגירה"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1 text-right">
            <h2 id="book-shift-title" className="text-xl font-bold text-[#001F3F]">
              תיאום משמרת
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              בקשה ל
              <span className="font-semibold text-navy-header">{sitterName}</span>
              {rateLoading ? (
                <span className="mr-2 text-xs text-slate-500">(טוען תעריף…)</span>
              ) : sitterHourlyRate != null ? (
                <span className="mr-2 text-xs font-medium text-emerald-700">
                  ({sitterHourlyRate} ₪/שעה)
                </span>
              ) : null}
            </p>
          </div>

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#001F3F]/10">
            <Calendar className="h-5 w-5 text-[#001F3F]" aria-hidden />
          </div>
        </div>

        {success ? (
          <div
            className="mt-5 flex flex-col items-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center"
            role="status"
            aria-live="polite"
          >
            <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden />
            <p className="mt-3 text-base font-bold text-emerald-950">{SUCCESS_MESSAGE}</p>
            <p className="mt-1 text-xs text-emerald-800">
              הבייביסיטר תקבל התראה ותוכל לאשר או לדחות.
            </p>
          </div>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
            {lockedShift ? (
              <div className="space-y-3 rounded-2xl border border-navy-header/10 bg-[#FDFBF6] px-4 py-4 text-right">
                <div className="flex flex-row-reverse items-start gap-3">
                  <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-[#001F3F]" aria-hidden />
                  <p className="min-w-0 flex-1 text-sm font-bold text-[#001F3F]">
                    {lockedDateLabel}
                    {lockedEndDateLabel ? (
                      <>
                        <span className="mx-1 font-medium text-slate-400">→</span>
                        {lockedEndDateLabel}
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-row-reverse items-center gap-3">
                  <Clock className="h-5 w-5 shrink-0 text-[#001F3F]" aria-hidden />
                  <p className="text-base font-bold tabular-nums text-[#001F3F]">{lockedTimeLabel}</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-3">
                  <label className="block text-right text-sm font-semibold text-[#001F3F]">
                    תאריך התחלה
                    <input
                      type="date"
                      required
                      min={minDate}
                      value={bookingDate}
                      disabled={busy}
                      onChange={(ev) => {
                        const next = ev.target.value;
                        setBookingDate(next);
                        if (!endBookingDate || endBookingDate === bookingDate) {
                          setEndBookingDate(next);
                        }
                      }}
                      className="mt-1.5 block min-h-12 w-full rounded-2xl border border-navy-header/15 bg-[#FDFBF6] px-3 py-2.5 text-sm tabular-nums shadow-inner disabled:opacity-50"
                    />
                  </label>
                  <fieldset className="rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 p-3">
                    <legend className="px-1 text-right text-sm font-semibold text-[#001F3F]">
                      שעת התחלה
                    </legend>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <select
                        required
                        aria-label="שעת התחלה — שעה"
                        value={startHour}
                        disabled={busy}
                        onChange={(ev) => setStartHour(ev.target.value)}
                        className="min-h-11 w-full rounded-xl border border-navy-header/15 bg-white px-2 py-2 text-sm tabular-nums"
                      >
                        <option value="">שעה</option>
                        {PARENT_SEARCH_HOUR_OPTIONS.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                      <select
                        required
                        aria-label="שעת התחלה — דקות"
                        value={startMinute}
                        disabled={busy}
                        onChange={(ev) => setStartMinute(ev.target.value)}
                        className="min-h-11 w-full rounded-xl border border-navy-header/15 bg-white px-2 py-2 text-sm tabular-nums"
                      >
                        <option value="">דק׳</option>
                        {BOOK_SHIFT_MINUTE_OPTIONS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </fieldset>
                </div>

                <div className="flex flex-col gap-3 border-r border-navy-header/10 pr-3">
                  <label className="block text-right text-sm font-semibold text-[#001F3F]">
                    תאריך סיום
                    <input
                      type="date"
                      required
                      min={bookingDate || minDate}
                      value={endBookingDate}
                      disabled={busy}
                      onChange={(ev) => setEndBookingDate(ev.target.value)}
                      className="mt-1.5 block min-h-12 w-full rounded-2xl border border-navy-header/15 bg-[#FDFBF6] px-3 py-2.5 text-sm tabular-nums shadow-inner disabled:opacity-50"
                    />
                  </label>
                  <fieldset className="rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 p-3">
                    <legend className="px-1 text-right text-sm font-semibold text-[#001F3F]">
                      שעת סיום
                    </legend>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <select
                        required
                        aria-label="שעת סיום — שעה"
                        value={endHour}
                        disabled={busy}
                        onChange={(ev) => setEndHour(ev.target.value)}
                        className="min-h-11 w-full rounded-xl border border-navy-header/15 bg-white px-2 py-2 text-sm tabular-nums"
                      >
                        <option value="">שעה</option>
                        {PARENT_SEARCH_HOUR_OPTIONS.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                      <select
                        required
                        aria-label="שעת סיום — דקות"
                        value={endMinute}
                        disabled={busy}
                        onChange={(ev) => setEndMinute(ev.target.value)}
                        className="min-h-11 w-full rounded-xl border border-navy-header/15 bg-white px-2 py-2 text-sm tabular-nums"
                      >
                        <option value="">דק׳</option>
                        {BOOK_SHIFT_MINUTE_OPTIONS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </fieldset>
                </div>
              </div>
            )}

            {error ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-right text-xs text-rose-900">
                {error}
              </p>
            ) : null}

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="submit"
                disabled={busy || rateLoading || sitterHourlyRate == null}
                className="inline-flex w-full flex-row-reverse items-center justify-center gap-2 rounded-2xl bg-[#001F3F] px-4 py-3.5 text-sm font-bold text-white shadow-soft transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#001F3F] disabled:opacity-60"
              >
                {busy ? "שולחים…" : rateLoading ? "טוענים תעריף…" : "שלח בקשה"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleClose}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
              >
                ביטול
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
