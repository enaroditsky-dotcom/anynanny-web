"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Smartphone } from "lucide-react";
import { ActionToast } from "@/components/ui/action-toast";
import { PersonalAreaSection } from "@/components/personal-area/personal-area-ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  EMPTY_SITTER_PAYOUT_METHODS,
  fetchSitterPayoutMethods,
  formatIsraeliMobileDisplay,
  payboxManualReceivingConfigured,
  payoutMethodConfigured,
  validateOptionalBitPhone,
  validateOptionalPayboxPhone,
  type SitterPayoutMethods
} from "@/lib/wallet/sitter-payout-methods";
import { validateOptionalPayboxPaymentLink } from "@/lib/billing/paybox-payment-link";

type SitterManualReceivingDestinationsSectionProps = {
  sitterId: string;
};

const fieldClassName =
  "mt-1.5 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-[#0B3C5D]/40 focus:bg-white focus:ring-2 focus:ring-[#0B3C5D]/15 disabled:opacity-60";

async function saveReceivingPhone(input: {
  kind: "bit" | "paybox";
  bitPhone?: string;
  payboxPhone?: string;
  payboxLink?: string;
}): Promise<{ ok: true; methods: SitterPayoutMethods } | { ok: false; error: string }> {
  const res = await fetch("/api/sitter/payout-methods", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      kind: input.kind,
      bitPhone: input.bitPhone,
      payboxPhone: input.payboxPhone,
      payboxLink: input.payboxLink,
      preferred: false
    })
  });
  const json = (await res.json().catch(() => ({}))) as {
    methods?: SitterPayoutMethods;
    error?: string;
  };
  if (!res.ok || !json.methods) {
    return { ok: false, error: json.error || "שמירת המספר נכשלה." };
  }
  return { ok: true, methods: json.methods };
}

/**
 * Optional Bit / PayBox receiving numbers for parent manual payment.
 * Same canonical columns as wallet payout destinations. Never copies the contact phone.
 */
export function SitterManualReceivingDestinationsSection({
  sitterId
}: SitterManualReceivingDestinationsSectionProps) {
  const [methods, setMethods] = useState<SitterPayoutMethods>({ ...EMPTY_SITTER_PAYOUT_METHODS });
  const [bitPhone, setBitPhone] = useState("");
  const [payboxPhone, setPayboxPhone] = useState("");
  const [payboxLink, setPayboxLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingBit, setSavingBit] = useState(false);
  const [savingPaybox, setSavingPaybox] = useState(false);
  const [savingPayboxLink, setSavingPayboxLink] = useState(false);
  const [bitError, setBitError] = useState<string | null>(null);
  const [payboxError, setPayboxError] = useState<string | null>(null);
  const [payboxLinkError, setPayboxLinkError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !sitterId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await fetchSitterPayoutMethods(supabase, sitterId);
    setMethods(result.methods);
    setBitPhone(result.methods.bitPhone);
    setPayboxPhone(result.methods.payboxPhone);
    setPayboxLink(result.methods.payboxLink);
    setLoading(false);
  }, [sitterId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const saveBit = async () => {
    const err = validateOptionalBitPhone(bitPhone);
    if (err) {
      setBitError(err);
      return;
    }
    setBitError(null);
    setSavingBit(true);
    const result = await saveReceivingPhone({ kind: "bit", bitPhone });
    setSavingBit(false);
    if (!result.ok) {
      setBitError(result.error);
      return;
    }
    setMethods(result.methods);
    setBitPhone(result.methods.bitPhone);
    setToast(
      result.methods.bitPhone.trim()
        ? "מספר Bit נשמר. ההורים יראו אותו רק בתשלום ידני."
        : "מספר Bit הוסר."
    );
  };

  const savePaybox = async () => {
    const err = validateOptionalPayboxPhone(payboxPhone);
    if (err) {
      setPayboxError(err);
      return;
    }
    setPayboxError(null);
    setSavingPaybox(true);
    const result = await saveReceivingPhone({ kind: "paybox", payboxPhone });
    setSavingPaybox(false);
    if (!result.ok) {
      setPayboxError(result.error);
      return;
    }
    setMethods(result.methods);
    setPayboxPhone(result.methods.payboxPhone);
    setPayboxLink(result.methods.payboxLink);
    setToast(
      result.methods.payboxPhone.trim()
        ? "מספר PayBox נשמר. ההורים יראו אותו רק בתשלום ידני."
        : "מספר PayBox הוסר."
    );
  };

  const savePayboxLink = async () => {
    const err = validateOptionalPayboxPaymentLink(payboxLink);
    if (err) {
      setPayboxLinkError(err);
      return;
    }
    setPayboxLinkError(null);
    setSavingPayboxLink(true);
    const result = await saveReceivingPhone({ kind: "paybox", payboxLink });
    setSavingPayboxLink(false);
    if (!result.ok) {
      setPayboxLinkError(result.error);
      return;
    }
    setMethods(result.methods);
    setPayboxLink(result.methods.payboxLink);
    setToast(
      result.methods.payboxLink.trim()
        ? "לינק PayBox נשמר. ההורים יפתחו אותו רק בתשלום ידני."
        : "לינק PayBox הוסר."
    );
  };

  const clearPayboxLink = async () => {
    setPayboxLinkError(null);
    setSavingPayboxLink(true);
    const result = await saveReceivingPhone({ kind: "paybox", payboxLink: "" });
    setSavingPayboxLink(false);
    if (!result.ok) {
      setPayboxLinkError(result.error);
      return;
    }
    setMethods(result.methods);
    setPayboxLink("");
    setToast("לינק PayBox הוסר.");
  };

  return (
    <>
      <PersonalAreaSection
        title="קבלה ב-Bit וב-PayBox"
        accent="emerald"
        description="מספרים אופציונליים להורים אחרי המשמרת. התשלום מתבצע מחוץ ל-AnyNanny. לא מוצג בפרופיל הציבורי ולא מועתק ממספר הוואטסאפ."
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-4 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">טוען מספרי קבלה…</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-[#0B3C5D]" aria-hidden />
                <p className="text-sm font-bold text-[#001F3F]">Bit</p>
              </div>
              <p className="text-[13px] text-slate-500">
                {payoutMethodConfigured(methods, "bit")
                  ? `שמור: ${formatIsraeliMobileDisplay(methods.bitPhone)}`
                  : "לא הוגדר — ההורים יראו מזומן בלבד עבור Bit."}
              </p>
              <label className="mt-2 block text-right text-xs font-bold text-slate-600">
                מספר נייד לקבלת Bit
                <input
                  className={fieldClassName}
                  dir="ltr"
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="05X-XXX-XXXX"
                  value={bitPhone}
                  onChange={(e) => setBitPhone(e.target.value)}
                  disabled={savingBit}
                />
              </label>
              {bitError ? <p className="mt-1 text-xs font-medium text-rose-700">{bitError}</p> : null}
              <button
                type="button"
                onClick={() => void saveBit()}
                disabled={savingBit}
                className="mt-2 inline-flex min-h-[2.5rem] items-center justify-center rounded-xl bg-[#0B3C5D] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {savingBit ? <Loader2 className="h-4 w-4 animate-spin" /> : "שמירת Bit"}
              </button>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-[#0B3C5D]" aria-hidden />
                <p className="text-sm font-bold text-[#001F3F]">PayBox</p>
              </div>
              <p className="text-[13px] text-slate-500">
                {payboxManualReceivingConfigured(methods)
                  ? [
                      payoutMethodConfigured(methods, "paybox")
                        ? `מספר שמור: ${formatIsraeliMobileDisplay(methods.payboxPhone)}`
                        : null,
                      methods.payboxLink.trim() ? "לינק אישי שמור" : null
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : "לא הוגדר — ההורים לא יראו אפשרות PayBox."}
              </p>
              <label className="mt-2 block text-right text-xs font-bold text-slate-600">
                מספר נייד לקבלת PayBox
                <input
                  className={fieldClassName}
                  dir="ltr"
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="05X-XXX-XXXX"
                  value={payboxPhone}
                  onChange={(e) => setPayboxPhone(e.target.value)}
                  disabled={savingPaybox}
                />
              </label>
              {payboxError ? (
                <p className="mt-1 text-xs font-medium text-rose-700">{payboxError}</p>
              ) : null}
              <button
                type="button"
                onClick={() => void savePaybox()}
                disabled={savingPaybox}
                className="mt-2 inline-flex min-h-[2.5rem] items-center justify-center rounded-xl bg-[#0B3C5D] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {savingPaybox ? <Loader2 className="h-4 w-4 animate-spin" /> : "שמירת PayBox"}
              </button>
              <label className="mt-4 block text-right text-xs font-bold text-slate-600">
                לינק אישי לקבלת תשלום ב-PayBox
                <input
                  className={fieldClassName}
                  dir="ltr"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://links.payboxapp.com/…"
                  value={payboxLink}
                  onChange={(e) => setPayboxLink(e.target.value)}
                  disabled={savingPayboxLink}
                />
              </label>
              <p className="mt-1 text-[12px] font-medium text-slate-400">אופציונלי. קישור HTTPS של PayBox בלבד.</p>
              {payboxLinkError ? (
                <p className="mt-1 text-xs font-medium text-rose-700">{payboxLinkError}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void savePayboxLink()}
                  disabled={savingPayboxLink}
                  className="inline-flex min-h-[2.5rem] items-center justify-center rounded-xl bg-[#0B3C5D] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  {savingPayboxLink ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : methods.payboxLink.trim() ? (
                    "עדכון לינק"
                  ) : (
                    "שמירת לינק"
                  )}
                </button>
                {methods.payboxLink.trim() ? (
                  <button
                    type="button"
                    onClick={() => void clearPayboxLink()}
                    disabled={savingPayboxLink}
                    className="inline-flex min-h-[2.5rem] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 disabled:opacity-50"
                  >
                    מחיקת לינק
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </PersonalAreaSection>
      <ActionToast message={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
