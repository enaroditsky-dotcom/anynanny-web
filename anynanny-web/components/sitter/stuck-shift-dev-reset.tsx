"use client";

import { useCallback, useState } from "react";
import { resetStuckShiftsForSitter } from "@/lib/bookings/sitter-reset-stuck-shifts";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";

const SHOW_DEV_RESET =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEV_SHIFT_RESET === "true";

type Props = {
  onReset?: () => void | Promise<void>;
  className?: string;
};

export function StuckShiftDevResetButton({ onReset, className = "" }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleReset = useCallback(async () => {
    if (
      !window.confirm(
        "לאפס משמרות תקועות? פעולה זו תסגור כל session פעיל וכל booking פתוח להיום עבור המשתמש המחובר."
      )
    ) {
      return;
    }

    const auth = await resolveBrowserAuth();
    if (!auth.ok) {
      setMessage("יש להתחבר כדי לאפס משמרות.");
      return;
    }

    setBusy(true);
    setMessage(null);
    const result = await resetStuckShiftsForSitter(auth.supabase, auth.userId);
    setBusy(false);

    if (result.error) {
      setMessage(result.error);
      return;
    }

    const parts: string[] = [];
    if (result.sessionsCompleted > 0) {
      parts.push(`${result.sessionsCompleted} sessions הושלמו`);
    }
    if (result.sessionsCancelled > 0) {
      parts.push(`${result.sessionsCancelled} sessions בוטלו`);
    }
    if (result.bookingsCompleted > 0) {
      parts.push(`${result.bookingsCompleted} bookings נסגרו`);
    }
    setMessage(parts.length > 0 ? `אופס בהצלחה: ${parts.join(" · ")}` : "לא נמצאו משמרות פתוחות.");

    await onReset?.();
  }, [onReset]);

  if (!SHOW_DEV_RESET) {
    return null;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleReset()}
        className="w-full rounded-xl border border-dashed border-amber-400 bg-amber-50/90 px-3 py-2.5 text-xs font-semibold text-amber-950 transition hover:bg-amber-100 disabled:opacity-60"
      >
        {busy ? "מאפס משמרות…" : "איפוס משמרת תקועה (פיתוח)"}
      </button>
      {message ? (
        <p className="text-right text-[11px] leading-snug text-amber-900" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
