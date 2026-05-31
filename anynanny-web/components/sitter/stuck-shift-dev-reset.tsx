"use client";

import { useCallback, useState } from "react";
import { resetStuckShiftsForParent } from "@/lib/bookings/parent-reset-stuck-shifts";
import { resetStuckShiftsForSitter } from "@/lib/bookings/sitter-reset-stuck-shifts";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";

/** Rescue control — always visible on sitter/parent session screens (status-only Supabase writes). */
const SHOW_STUCK_SHIFT_RESET = true;

type Props = {
  onReset?: () => void | Promise<void>;
  className?: string;
  /** `link` — subtle text link pinned at screen bottom; `button` — full-width dashed control. */
  variant?: "button" | "link";
  role?: "parent" | "sitter";
};

export function StuckShiftDevResetButton({
  onReset,
  className = "",
  variant = "button",
  role = "sitter"
}: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleReset = useCallback(async () => {
    if (
      !window.confirm(
        "לאפס משמרת תקועה? פעולה זו תסגור sessions פתוחים ו-bookings פתוחים להיום (סטטוס בלבד)."
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

    const result =
      role === "parent"
        ? await resetStuckShiftsForParent(auth.supabase, auth.userId)
        : await resetStuckShiftsForSitter(auth.supabase, auth.userId);
    setBusy(false);

    try {
      await onReset?.();
    } catch (e) {
      console.warn("[StuckShiftDevReset] onReset:", e);
    }

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
    setMessage(
      parts.length > 0 ? `אופס בהצלחה: ${parts.join(" · ")}` : "המסך אופס — אין משמרות פתוחות."
    );
  }, [onReset, role]);

  if (!SHOW_STUCK_SHIFT_RESET) {
    return null;
  }

  return (
    <div className={`${variant === "link" ? "text-center" : "space-y-2"} ${className}`}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleReset()}
        className={
          variant === "link"
            ? "text-xs font-medium text-slate-500 underline decoration-slate-400/70 underline-offset-2 transition hover:text-amber-800 disabled:opacity-50"
            : "w-full rounded-xl border border-dashed border-amber-400 bg-amber-50/90 px-3 py-2.5 text-xs font-semibold text-amber-950 transition hover:bg-amber-100 disabled:opacity-60"
        }
      >
        {busy ? "מאפס משמרת…" : "איפוס משמרת תקועה"}
      </button>
      {message ? (
        <p
          className={`text-right leading-snug text-amber-900 ${variant === "link" ? "mt-1 text-center text-[10px]" : "text-[11px]"}`}
          role="status"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
