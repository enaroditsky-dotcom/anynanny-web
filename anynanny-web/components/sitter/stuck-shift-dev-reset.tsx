"use client";

import { useCallback, useState } from "react";
import { resetStuckShiftsForParent } from "@/lib/bookings/parent-reset-stuck-shifts";
import { resetStuckShiftsForSitter } from "@/lib/bookings/sitter-reset-stuck-shifts";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";

type Props = {
  className?: string;
  variant?: "button" | "link";
  role?: "parent" | "sitter";
};

export function StuckShiftDevResetButton({ className = "", variant = "button", role = "sitter" }: Props) {
  const [busy, setBusy] = useState(false);

  const handleReset = useCallback(async () => {
    if (!window.confirm("לאפס את המשמרת?")) return;

    setBusy(true);
    try {
      const auth = await resolveBrowserAuth();
      if (auth.ok) {
        if (role === "parent") await resetStuckShiftsForParent(auth.supabase, auth.userId);
        else await resetStuckShiftsForSitter(auth.supabase, auth.userId);
      }
      
      // ה-Ponytail Way: ריענון מלא. לא צריך הודעות, לא צריך ניהול State.
      // הריענון יטען את ה-UI הנקי מהשרת.
      window.location.reload();
    } catch (err) {
      console.error("Reset failed", err);
      setBusy(false);
    }
  }, [role]);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void handleReset()}
      className={`${className} ${variant === "link" 
        ? "text-xs text-slate-500 underline" 
        : "w-full rounded-xl border border-dashed border-amber-400 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-950"}`}
    >
      {busy ? "מאפס…" : "שחרור משמרת תקועה"}
    </button>
  );
}