"use client";

import type { FormEvent } from "react";
import { Calendar, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  createShiftRequest,
  PARENT_SEARCH_HOUR_OPTIONS,
  PARENT_SEARCH_MINUTE_OPTIONS,
  validateShiftWindow,
  type ParentSearchMinute
} from "@/lib/shift-requests/create-shift-request";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type BookShiftModalProps = {
  open: boolean;
  sitterId: string;
  sitterName: string;
  onClose: () => void;
  onSuccess?: (requestId: string) => void;
};

export function BookShiftModal({ open, sitterId, sitterName, onClose, onSuccess }: BookShiftModalProps) {
  const [shiftDate, setShiftDate] = useState("");
  const [startHour, setStartHour] = useState("");
  const [startMinute, setStartMinute] = useState<ParentSearchMinute | "">("");
  const [endHour, setEndHour] = useState("");
  const [endMinute, setEndMinute] = useState<ParentSearchMinute | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const resetForm = useCallback(() => {
    setShiftDate("");
    setStartHour("");
    setStartMinute("");
    setEndHour("");
    setEndMinute("");
    setError(null);
    setSuccess(false);
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open, resetForm]);

  const handleClose = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const validated = validateShiftWindow({
      shiftDate,
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
    const { requestId, error: rpcError } = await createShiftRequest(supabase, {
      sitterId,
      shiftDate: shiftDate.trim(),
      startIso: validated.startIso,
      endIso: validated.endIso
    });
    setBusy(false);

    if (rpcError || !requestId) {
      setError(rpcError ?? "לא ניתן לשלוח את הבקשה");
      return;
    }

    setSuccess(true);
    onSuccess?.(requestId);
  };

  if (!open) return null;

  const minDate = new Date().toISOString().slice(0, 10);

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/45 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="book-shift-title"
      dir="rtl"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-navy-header/15 bg-white p-5 shadow-xl shadow-[#001F3F]/15"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex flex-row-reverse items-start justify-between gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="rounded-full p-1 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
            aria-label="סגירה"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 text-right">
            <h2 id="book-shift-title" className="text-lg font-bold text-[#001F3F]">
              תיאום משמרת
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              בקשה ל<span className="font-semibold text-navy-header">{sitterName}</span> — הבייביסיטר תקבל התראה
              ותוכל לאשר או לדחות.
            </p>
          </div>
          <Calendar className="h-6 w-6 shrink-0 text-[#001F3F]" aria-hidden />
        </div>

        {success ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-right">
            <p className="text-sm font-semibold text-emerald-900">הבקשה נשלחה בהצלחה</p>
            <p className="mt-1 text-xs text-emerald-800">
              הבייביסיטר תקבל התראה. לאחר אישור, המשמרת תיסגר ביומן שלה.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="mt-4 w-full rounded-xl bg-[#001F3F] px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110"
            >
              סגירה
            </button>
          </div>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
            <label className="block text-right text-xs font-semibold text-navy-900">
              תאריך
              <input
                type="date"
                required
                min={minDate}
                value={shiftDate}
                disabled={busy}
                onChange={(ev) => setShiftDate(ev.target.value)}
                className="mt-1 block min-h-11 w-full rounded-xl border border-navy-header/20 bg-[#FDFBF6] px-3 py-2 text-sm tabular-nums disabled:opacity-50"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <fieldset className="rounded-xl border border-navy-header/10 bg-[#FDFBF6]/60 p-2.5">
                <legend className="px-1 text-right text-xs font-semibold text-navy-900">שעת התחלה</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <select
                    required
                    value={startHour}
                    disabled={busy}
                    onChange={(ev) => setStartHour(ev.target.value)}
                    className="min-h-10 w-full rounded-xl border border-navy-header/20 bg-white px-2 py-2 text-sm tabular-nums"
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
                    value={startMinute}
                    disabled={busy}
                    onChange={(ev) => setStartMinute(ev.target.value as ParentSearchMinute)}
                    className="min-h-10 w-full rounded-xl border border-navy-header/20 bg-white px-2 py-2 text-sm tabular-nums"
                  >
                    <option value="">דק׳</option>
                    {PARENT_SEARCH_MINUTE_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </fieldset>

              <fieldset className="rounded-xl border border-navy-header/10 bg-[#FDFBF6]/60 p-2.5">
                <legend className="px-1 text-right text-xs font-semibold text-navy-900">שעת סיום</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <select
                    required
                    value={endHour}
                    disabled={busy}
                    onChange={(ev) => setEndHour(ev.target.value)}
                    className="min-h-10 w-full rounded-xl border border-navy-header/20 bg-white px-2 py-2 text-sm tabular-nums"
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
                    value={endMinute}
                    disabled={busy}
                    onChange={(ev) => setEndMinute(ev.target.value as ParentSearchMinute)}
                    className="min-h-10 w-full rounded-xl border border-navy-header/20 bg-white px-2 py-2 text-sm tabular-nums"
                  >
                    <option value="">דק׳</option>
                    {PARENT_SEARCH_MINUTE_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </fieldset>
            </div>

            {error ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-right text-xs text-rose-900">
                {error}
              </p>
            ) : null}

            <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex flex-1 flex-row-reverse items-center justify-center gap-2 rounded-2xl bg-[#001F3F] px-4 py-3 text-sm font-bold text-white shadow-soft transition hover:brightness-110 disabled:opacity-60"
              >
                {busy ? "שולחים…" : "שלח בקשה"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleClose}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
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
