"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { submitUserReport } from "@/lib/safety/reports";
import {
  REPORT_CONFIRMATION_MESSAGE,
  REPORT_DETAILS_MAX_LENGTH,
  REPORT_REASONS,
  SELF_REPORT_MESSAGE,
  type ReportReason
} from "@/lib/safety/constants";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  open: boolean;
  reportedUserId: string;
  reportedName?: string | null;
  onClose: () => void;
};

export function ReportUserSheet({ open, reportedUserId, reportedName, onClose }: Props) {
  const { user } = useAuth();
  const [reason, setReason] = useState<ReportReason | "">("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!open) return null;

  const close = () => {
    if (busy) return;
    setReason("");
    setDetails("");
    setError(null);
    setDone(false);
    onClose();
  };

  const handleSubmit = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user?.id) {
      setError("יש להתחבר כדי לדווח.");
      return;
    }
    if (!reason) {
      setError("בחרו סיבת דיווח.");
      return;
    }
    if (user.id === reportedUserId) {
      setError(SELF_REPORT_MESSAGE);
      return;
    }

    setBusy(true);
    setError(null);
    const result = await submitUserReport(supabase, {
      reporterId: user.id,
      reportedUserId,
      reason,
      details
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDone(true);
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-user-title"
      dir="rtl"
      onClick={close}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {done ? (
          <>
            <h2 id="report-user-title" className="text-lg font-extrabold text-[#001F3F]">
              {REPORT_CONFIRMATION_MESSAGE}
            </h2>
            <p className="mt-2 text-sm text-slate-600">תודה. הצוות יבדוק את הדיווח.</p>
            <button
              type="button"
              onClick={close}
              className="mt-4 w-full rounded-xl bg-[#001F3F] px-4 py-3 text-sm font-bold text-white"
            >
              סגור
            </button>
          </>
        ) : (
          <>
            <h2 id="report-user-title" className="text-lg font-extrabold text-[#001F3F]">
              דיווח על משתמש
            </h2>
            {reportedName ? (
              <p className="mt-1 text-sm text-slate-600">{reportedName}</p>
            ) : null}

            <fieldset className="mt-4 space-y-2">
              <legend className="text-xs font-bold text-slate-500">סיבה</legend>
              {REPORT_REASONS.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={item.id}
                    checked={reason === item.id}
                    onChange={() => setReason(item.id)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </fieldset>

            <label className="mt-4 block text-xs font-bold text-slate-500" htmlFor="report-details">
              פרטים נוספים (אופציונלי)
            </label>
            <textarea
              id="report-details"
              value={details}
              maxLength={REPORT_DETAILS_MAX_LENGTH}
              onChange={(event) => setDetails(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-sm"
            />
            <p className="mt-1 text-left text-[11px] text-slate-400">
              {details.length}/{REPORT_DETAILS_MAX_LENGTH}
            </p>

            {error ? (
              <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={busy}
                className="rounded-xl bg-[#001F3F] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy ? "שולח…" : "שלח דיווח"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
