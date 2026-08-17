"use client";

import { useCallback, useEffect, useState } from "react";
import { Landmark, Loader2, Pencil, Trash2 } from "lucide-react";
import { ActionToast } from "@/components/ui/action-toast";
import { SitterBankDetailsModal } from "@/components/sitter/SitterBankDetailsModal";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  EMPTY_SITTER_BANK_DETAILS,
  clearSitterBankDetails,
  fetchSitterBankDetails,
  hasSitterBankDetails,
  type SitterBankDetails
} from "@/lib/wallet/sitter-bank-details";

type SitterBankDetailsSectionProps = {
  sitterId: string;
  className?: string;
};

function maskAccount(account: string): string {
  const cleaned = account.replace(/\s+/g, "");
  if (cleaned.length <= 4) return cleaned;
  return `${"•".repeat(Math.min(6, cleaned.length - 4))}${cleaned.slice(-4)}`;
}

/**
 * Personal-area bank details card — same Supabase fields as the wallet modal.
 */
export function SitterBankDetailsSection({ sitterId, className = "" }: SitterBankDetailsSectionProps) {
  const [details, setDetails] = useState<SitterBankDetails>({ ...EMPTY_SITTER_BANK_DETAILS });
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !sitterId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const result = await fetchSitterBankDetails(supabase, sitterId);
    setDetails(result.details);
    setMissingSchema(result.missingSchema);
    if (result.missingSchema) {
      setError(
        "עמודות פרטי הבנק חסרות בפרופיל. הריצו sql/sitter_profiles_bank_details.sql ב-Supabase."
      );
    } else if (result.error) {
      setError(result.error);
    }
    setLoading(false);
  }, [sitterId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleClear = async () => {
    if (!hasSitterBankDetails(details)) return;
    if (!window.confirm("למחוק את פרטי הבנק השמורים?")) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("שירות הארנק אינו זמין כרגע.");
      return;
    }

    setClearing(true);
    setError(null);
    const result = await clearSitterBankDetails(supabase, sitterId);
    setClearing(false);

    if (!result.ok) {
      setMissingSchema(Boolean(result.missingSchema));
      setError(result.error);
      return;
    }

    setDetails({ ...EMPTY_SITTER_BANK_DETAILS });
    setToast("פרטי הבנק נמחקו");
  };

  const filled = hasSitterBankDetails(details);

  return (
    <section
      className={`rounded-2xl border border-navy-header/10 bg-white p-4 shadow-soft ${className}`}
      dir="rtl"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 text-right">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0B3C5D]/10 text-[#0B3C5D]">
            <Landmark className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-navy-header">פרטי בנק</h2>
            <p className="text-[13px] text-slate-500">למשיכת רווחים מהארנק</p>
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-[#0B3C5D]" />
            <span className="text-xs">טוען פרטי בנק...</span>
          </div>
        ) : filled ? (
          <dl className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3 text-right">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[13px] font-semibold text-slate-500">מספר בנק</dt>
              <dd className="text-xs font-bold tabular-nums text-slate-800" dir="ltr">
                {details.bank_code || "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[13px] font-semibold text-slate-500">שם הבנק</dt>
              <dd className="text-xs font-bold text-slate-800">{details.bank_name || "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[13px] font-semibold text-slate-500">סניף</dt>
              <dd className="text-xs font-bold text-slate-800">{details.bank_branch || "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[13px] font-semibold text-slate-500">מספר חשבון</dt>
              <dd className="text-xs font-bold tabular-nums text-slate-800" dir="ltr">
                {details.bank_account_number ? maskAccount(details.bank_account_number) : "—"}
              </dd>
            </div>
          </dl>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-4 text-center">
            <p className="text-xs font-bold text-slate-700">עדיין לא נשמרו פרטי בנק</p>
            <p className="mt-1 text-[13px] text-slate-500">
              הוסיפו חשבון בנק כדי שנוכל להעביר אליכם רווחים.
            </p>
          </div>
        )}

        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-800">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={missingSchema}
            onClick={() => setModalOpen(true)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#0B3C5D] px-3 py-2.5 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            {filled ? "עריכת פרטי בנק" : "הוספת פרטי בנק"}
          </button>
          {filled ? (
            <button
              type="button"
              disabled={clearing || missingSchema}
              onClick={() => void handleClear()}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
            >
              {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              מחיקה
            </button>
          ) : null}
        </div>
      </div>

      <SitterBankDetailsModal
        sitterId={sitterId}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={(next) => {
          setDetails(next);
        }}
      />

      <ActionToast message={toast} variant="success" durationMs={3500} onDismiss={() => setToast(null)} />
    </section>
  );
}
