"use client";

import { useCallback, useState } from "react";
import { deleteCurrentUserAccount } from "@/lib/account/delete-current-user";
import { clearDeviceAuthHints } from "@/lib/auth/returning-user";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function DeleteAccountSection() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeDialog = useCallback(() => {
    if (busy) return;
    setDialogOpen(false);
    setError(null);
  }, [busy]);

  const handleConfirmDelete = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase לא מוגדר.");
      return;
    }

    setBusy(true);
    setError(null);

    const result = await deleteCurrentUserAccount(supabase);
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
      return;
    }

    await supabase.auth.signOut();
    clearDeviceAuthHints();
    window.location.assign("/");
  }, []);

  return (
    <>
      <section
        className="mt-8 rounded-2xl border border-rose-200/80 bg-white p-4 shadow-soft sm:p-5"
        dir="rtl"
      >
        <h2 className="text-right text-sm font-bold text-rose-950">אזור מסוכן</h2>
        <p className="mt-1 text-right text-xs leading-relaxed text-slate-600">
          מחיקת החשבון תסיר לצמיתות את הפרופיל, המשמרות וההיסטוריה שלך מהמערכת.
        </p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setDialogOpen(true);
          }}
          className="mt-4 w-full rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-rose-700 active:scale-[0.99] disabled:opacity-60"
        >
          מחק חשבון לצמיתות
        </button>
      </section>

      {dialogOpen ? (
        <div
          className="fixed inset-0 z-[130] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
          dir="rtl"
          onClick={closeDialog}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-navy-header/15 bg-white p-5 shadow-xl shadow-[#001F3F]/15"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-account-title" className="text-right text-lg font-bold text-[#001F3F]">
              האם אתה בטוח שברצונך למחוק את החשבון?
            </h2>
            <p className="mt-2 text-right text-sm leading-relaxed text-slate-600">
              פעולה זו היא בלתי הפיכה וכל הנתונים שלך, המשמרות וההיסטוריה יימחקו לצמיתות.
            </p>

            {error ? (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-right text-xs text-rose-900">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirmDelete()}
                className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
              >
                {busy ? "מוחקים…" : "כן, מחק את החשבון שלי"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={closeDialog}
                className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200/80 disabled:opacity-60"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
