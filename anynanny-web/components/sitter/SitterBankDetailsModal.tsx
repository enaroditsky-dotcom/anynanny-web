"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Landmark, Loader2, X } from "lucide-react";
import { ActionToast } from "@/components/ui/action-toast";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  EMPTY_SITTER_BANK_DETAILS,
  fetchSitterBankDetails,
  saveSitterBankDetails,
  type SitterBankDetails
} from "@/lib/wallet/sitter-bank-details";
import {
  israelBankCodeOptions,
  israelBankNameOptions,
  syncBankFieldsFromCode,
  syncBankFieldsFromName
} from "@/lib/geo/israel-banks";

type SitterBankDetailsModalProps = {
  sitterId: string;
  open: boolean;
  onClose: () => void;
  onSaved?: (details: SitterBankDetails) => void;
  /** Keep modal open this long after save so the toast is visible. Default 1500ms. */
  autoCloseMs?: number;
};

const fieldClassName =
  "w-full appearance-none rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-[#0B3C5D]/40 focus:bg-white focus:ring-2 focus:ring-[#0B3C5D]/15 disabled:opacity-60";

const SUCCESS_TOAST = "פרטי הבנק נשמרו בהצלחה";

export function SitterBankDetailsModal({
  sitterId,
  open,
  onClose,
  onSaved,
  autoCloseMs = 1500
}: SitterBankDetailsModalProps) {
  const [form, setForm] = useState<SitterBankDetails>({ ...EMPTY_SITTER_BANK_DETAILS });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [saveSucceeded, setSaveSucceeded] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open || !sitterId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setToast(null);
    setSaveSucceeded(false);
    setMissingSchema(false);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    void (async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) {
          setError("שירות הארנק אינו זמין כרגע.");
          setLoading(false);
        }
        return;
      }

      const result = await fetchSitterBankDetails(supabase, sitterId);
      if (cancelled) return;
      setForm(result.details);
      setMissingSchema(result.missingSchema);
      if (result.missingSchema) {
        setError(
          "עמודות פרטי הבנק חסרות בפרופיל. הריצו sql/sitter_profiles_bank_details.sql ב-Supabase."
        );
      } else if (result.error) {
        setError(result.error);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, sitterId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving && !saveSucceeded) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, saveSucceeded, onClose]);

  const handleBankNameChange = (bankName: string) => {
    const synced = syncBankFieldsFromName(bankName);
    setForm((prev) => ({
      ...prev,
      bank_name: synced.bank_name,
      bank_code: synced.bank_code
    }));
  };

  const handleBankCodeChange = (bankCode: string) => {
    const synced = syncBankFieldsFromCode(bankCode);
    setForm((prev) => ({
      ...prev,
      bank_code: synced.bank_code,
      bank_name: bankCode ? synced.bank_name : ""
    }));
  };

  const handleSave = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("שירות הארנק אינו זמין כרגע.");
      return;
    }

    setSaving(true);
    setError(null);

    const result = await saveSitterBankDetails(supabase, sitterId, form);
    setSaving(false);

    if (!result.ok) {
      setMissingSchema(Boolean(result.missingSchema));
      setError(result.error);
      return;
    }

    setForm(result.details);
    setSaveSucceeded(true);
    setToast(SUCCESS_TOAST);
    onSaved?.(result.details);

    // Keep modal open so the toast is visible, then close.
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setToast(null);
      setSaveSucceeded(false);
      onClose();
    }, autoCloseMs);
  };

  if (!open) return null;

  const locked = saving || saveSucceeded;

  return (
    <>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        aria-label="עדכון פרטי בנק"
        dir="rtl"
        onClick={(e) => {
          if (e.target === e.currentTarget && !locked) onClose();
        }}
      >
        <div className="relative w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 text-right">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0B3C5D]/10 text-[#0B3C5D]">
                <Landmark className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-900">פרטי חשבון בנק</h2>
                <p className="text-[11px] text-slate-500">לצורך משיכת רווחים לארנק</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={locked}
              aria-label="סגור"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin text-[#0B3C5D]" />
              <p className="text-xs">טוען פרטי בנק...</p>
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!locked) void handleSave();
              }}
            >
              <label className="block space-y-1.5 text-right">
                <span className="text-[11px] font-bold text-slate-700">מספר בנק</span>
                <select
                  value={form.bank_code}
                  onChange={(e) => handleBankCodeChange(e.target.value)}
                  disabled={locked || missingSchema}
                  dir="ltr"
                  className={`${fieldClassName} text-left tabular-nums`}
                >
                  <option value="">בחרו מספר בנק…</option>
                  {israelBankCodeOptions(form.bank_code).map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1.5 text-right">
                <span className="text-[11px] font-bold text-slate-700">שם הבנק</span>
                <select
                  value={form.bank_name}
                  onChange={(e) => handleBankNameChange(e.target.value)}
                  disabled={locked || missingSchema}
                  className={fieldClassName}
                >
                  <option value="">בחרו בנק…</option>
                  {israelBankNameOptions(form.bank_name).map((bank) => (
                    <option key={bank} value={bank}>
                      {bank}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1.5 text-right">
                <span className="text-[11px] font-bold text-slate-700">סניף</span>
                <input
                  type="text"
                  value={form.bank_branch}
                  onChange={(e) => setForm((prev) => ({ ...prev, bank_branch: e.target.value }))}
                  placeholder="מספר או שם סניף"
                  disabled={locked || missingSchema}
                  className={fieldClassName}
                  autoComplete="off"
                />
              </label>

              <label className="block space-y-1.5 text-right">
                <span className="text-[11px] font-bold text-slate-700">מספר חשבון</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.bank_account_number}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, bank_account_number: e.target.value }))
                  }
                  placeholder="מספר חשבון בנק"
                  disabled={locked || missingSchema}
                  dir="ltr"
                  className={`${fieldClassName} text-left tracking-wide`}
                  autoComplete="off"
                />
              </label>

              {error ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-800">
                  {error}
                </p>
              ) : null}

              {saveSucceeded ? (
                <p className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  {SUCCESS_TOAST}
                </p>
              ) : null}

              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="submit"
                  disabled={locked || missingSchema}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0B3C5D] py-3 text-xs font-bold text-white shadow-md transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {saving ? "שומר..." : saveSucceeded ? "נשמר" : "שמירת פרטי בנק"}
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={onClose}
                  className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 text-[11px] font-bold text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  סגור
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Above the modal overlay so the floating bubble is visible while the dialog stays open. */}
      <ActionToast
        message={toast}
        variant="success"
        durationMs={0}
        className="!bottom-8 !z-[10050]"
      />
    </>
  );
}
