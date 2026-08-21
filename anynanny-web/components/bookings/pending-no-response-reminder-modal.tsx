"use client";

import { useCallback, useId, useState } from "react";
import {
  PENDING_WITHDRAW_COPY,
  withdrawPendingBooking
} from "@/lib/bookings/withdraw-pending-booking";
import { usePendingNoResponseReminder } from "@/lib/notifications/use-pending-no-response-reminder";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type PendingNoResponseReminderModalProps = {
  parentId: string | null;
  enabled?: boolean;
  onWithdrawn?: (bookingId: string) => void;
};

export function PendingNoResponseReminderModal({
  parentId,
  enabled = true,
  onWithdrawn
}: PendingNoResponseReminderModalProps) {
  const titleId = useId();
  const { reminder, markRead } = usePendingNoResponseReminder(parentId, enabled);
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleNo = useCallback(async () => {
    if (!reminder || busy) return;
    setBusy("no");
    setError(null);
    await markRead(reminder);
    setBusy(null);
  }, [busy, markRead, reminder]);

  const handleYes = useCallback(async () => {
    if (!reminder || busy) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError(PENDING_WITHDRAW_COPY.genericError);
      return;
    }

    setBusy("yes");
    setError(null);
    const result = await withdrawPendingBooking(supabase, reminder.bookingId);
    if (!result.ok) {
      setBusy(null);
      setError(result.error);
      if (result.error === PENDING_WITHDRAW_COPY.alreadyHandled) {
        await markRead(reminder);
      }
      return;
    }

    await markRead(reminder);
    onWithdrawn?.(reminder.bookingId);
    setBusy(null);
  }, [busy, markRead, onWithdrawn, reminder]);

  if (!reminder) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-[#001F3F]/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="w-full max-w-sm rounded-3xl border border-slate-200 bg-[#FDFBF6] p-5 text-right shadow-2xl"
        dir="rtl"
      >
        <h2 id={titleId} className="text-lg font-bold text-navy-header">
          {PENDING_WITHDRAW_COPY.reminderTitle}
        </h2>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">
          {PENDING_WITHDRAW_COPY.reminderBody}
        </p>
        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-row-reverse gap-2">
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void handleYes()}
            className="min-h-11 flex-1 rounded-2xl bg-rose-700 px-4 text-sm font-bold text-white disabled:opacity-60"
          >
            {busy === "yes" ? PENDING_WITHDRAW_COPY.reminderYesBusy : PENDING_WITHDRAW_COPY.reminderYes}
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void handleNo()}
            className="min-h-11 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-navy-header disabled:opacity-60"
          >
            {busy === "no" ? PENDING_WITHDRAW_COPY.reminderNoBusy : PENDING_WITHDRAW_COPY.reminderNo}
          </button>
        </div>
      </div>
    </div>
  );
}
