"use client";

import { Ban, Flag, Shield, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ReportUserSheet } from "@/components/safety/report-user-sheet";
import { blockUser } from "@/lib/safety/blocks";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  targetUserId: string;
  targetName?: string | null;
  className?: string;
};

const SAFETY_TITLE = "ביטחון ודיווח";
const SAFETY_EXPLANATION =
  "אם נתקלת בהתנהגות לא הולמת או שיש לך חשש לגבי משתמש זה, ניתן לדווח עליו או לחסום אותו.";

export function UserSafetyActions({ targetUserId, targetName, className = "" }: Props) {
  const { user } = useAuth();
  const titleId = useId();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeChooser = () => {
    if (busy) return;
    setChooserOpen(false);
    setError(null);
  };

  useEffect(() => {
    if (!chooserOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        setChooserOpen(false);
        setError(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chooserOpen, busy]);

  if (!user?.id || user.id === targetUserId) return null;

  const handleReport = () => {
    setError(null);
    setChooserOpen(false);
    setReportOpen(true);
  };

  const handleBlock = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const result = await blockUser(supabase, user.id, targetUserId);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setChooserOpen(false);
  };

  return (
    <div className={`space-y-2 ${className}`} dir="rtl">
      <button
        type="button"
        onClick={() => setChooserOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
      >
        <Shield className="h-3.5 w-3.5" aria-hidden />
        {SAFETY_TITLE}
      </button>

      {chooserOpen ? (
        <div
          className="fixed inset-0 z-[120] overflow-y-auto overscroll-contain bg-black/45 px-4 pt-4 pb-[calc(8rem+var(--anynanny-now-dock,0px)+env(safe-area-inset-bottom,0px))] scroll-pb-[calc(8rem+var(--anynanny-now-dock,0px)+env(safe-area-inset-bottom,0px))]"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          dir="rtl"
          onClick={closeChooser}
        >
          <div className="flex min-h-full justify-center">
            <div
              className="relative my-auto w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
            <button
              type="button"
              onClick={closeChooser}
              disabled={busy}
              aria-label="סגור"
              className="absolute left-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>

            <h2 id={titleId} className="pl-10 text-lg font-extrabold text-[#001F3F]">
              {SAFETY_TITLE}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{SAFETY_EXPLANATION}</p>

            {error ? (
              <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-4 grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={handleReport}
                disabled={busy}
                className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                <Flag className="h-4 w-4" aria-hidden />
                דיווח
              </button>
              <button
                type="button"
                onClick={() => void handleBlock()}
                disabled={busy}
                className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
              >
                <Ban className="h-4 w-4" aria-hidden />
                חסימה
              </button>
              <button
                type="button"
                onClick={closeChooser}
                disabled={busy}
                className="min-h-11 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 disabled:opacity-60"
              >
                ביטול
              </button>
            </div>
            </div>
          </div>
        </div>
      ) : null}

      <ReportUserSheet
        open={reportOpen}
        reportedUserId={targetUserId}
        reportedName={targetName}
        onClose={() => setReportOpen(false)}
      />
    </div>
  );
}
