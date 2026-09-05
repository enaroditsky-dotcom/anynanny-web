"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, HelpCircle, Loader2, Smartphone } from "lucide-react";
import { ActionToast } from "@/components/ui/action-toast";
import { sitterReceivingSummary } from "@/components/personal-area/personal-area-summaries";
import { PersonalAreaSection } from "@/components/personal-area/personal-area-ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { sitterReceivingSetupState } from "@/lib/billing/payment-method-availability";
import {
  EMPTY_SITTER_PAYOUT_METHODS,
  fetchSitterPayoutMethods,
  formatIsraeliMobileDisplay,
  payboxManualReceivingConfigured,
  payoutMethodConfigured,
  preferredReceivingMethodLabel,
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

export const PAYBOX_PERSONAL_LINK_HELP_TOGGLE = "הסבר";
export const PAYBOX_PERSONAL_LINK_HELP_TITLE = "איך משתמשים בלינק האישי שלי ב-PayBox?";
export const PAYBOX_PERSONAL_LINK_HELP_PARAGRAPHS = [
  "יש כמה דרכים להשתמש בלינק האישי שלך ב-PayBox.",
  "כדי למצוא את הלינק האישי שלך, יש להיכנס ל-PayBox ולפתוח את האפשרות של הלינק האישי שלך.",
  "לאחר קבלת הלינק ניתן להעתיק אותו ולשתף אותו בוואטסאפ, SMS, מייל או בכל מקום אחר שבו ניתן לשלוח קישור.",
  "כאשר הורה לוחץ על הלינק, PayBox נפתח ומאפשר לו להעביר אלייך תשלום.",
  "ניתן להשתמש באותו לינק גם ליצירת קוד QR, כך שניתן לסרוק אותו ולבצע תשלום ישירות דרך PayBox.",
  "ב-AnyNanny יש להעתיק את הלינק האישי שלך מ-PayBox ולהדביק אותו בשדה שמעל.",
  "הלינק צריך להתחיל ב:"
] as const;
export const PAYBOX_PERSONAL_LINK_HELP_PREFIX = "https://";
export const PAYBOX_PERSONAL_LINK_HELP_STEPS = [
  "פתחי את אפליקציית PayBox.",
  "מצאי את הלינק האישי שלך לקבלת תשלום.",
  "העתיקי את הלינק.",
  "חזרי ל-AnyNanny.",
  "הדביקי אותו בשדה PayBox.",
  "שמרי את השינוי."
] as const;

const PREFERRED_SELECT_BUTTON_LABEL = "בחירה כעדיפות";

async function savePreferredMethod(
  kind: "cash" | "bit" | "paybox"
): Promise<{ ok: true; methods: SitterPayoutMethods } | { ok: false; error: string }> {
  const res = await fetch("/api/sitter/payout-methods", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(kind === "cash" ? { kind: "cash" } : { kind, preferred: true })
  });
  const json = (await res.json().catch(() => ({}))) as {
    methods?: SitterPayoutMethods;
    error?: string;
  };
  if (!res.ok || !json.methods) {
    return { ok: false, error: json.error || "שמירת ההעדפה נכשלה." };
  }
  return { ok: true, methods: json.methods };
}

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
  const [savingPreferred, setSavingPreferred] = useState<"cash" | "bit" | "paybox" | null>(
    null
  );
  const [savingPayboxLink, setSavingPayboxLink] = useState(false);
  const [bitError, setBitError] = useState<string | null>(null);
  const [preferredError, setPreferredError] = useState<string | null>(null);
  const [payboxError, setPayboxError] = useState<string | null>(null);
  const [payboxLinkError, setPayboxLinkError] = useState<string | null>(null);
  const [payboxLinkHelpOpen, setPayboxLinkHelpOpen] = useState(false);
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

  const selectPreferred = async (kind: "cash" | "bit" | "paybox") => {
    setPreferredError(null);
    setSavingPreferred(kind);
    const result = await savePreferredMethod(kind);
    setSavingPreferred(null);
    if (!result.ok) {
      setPreferredError(result.error);
      return;
    }
    setMethods(result.methods);
    const label = preferredReceivingMethodLabel(kind) || kind;
    setToast(`${label} נבחר כדרך קבלת התשלום.`);
  };

  const preferredButton = (kind: "cash" | "bit" | "paybox") => {
    const selected = methods.preferred === kind;
    const saving = savingPreferred === kind;
    return (
      <button
        type="button"
        onClick={() => void selectPreferred(kind)}
        disabled={savingPreferred !== null || selected}
        className={`inline-flex min-h-[2.5rem] items-center justify-center rounded-xl bg-[#0B3C5D] px-4 py-2 text-xs font-bold text-white disabled:opacity-50 ${
          kind === "cash" ? "mt-2" : ""
        }`}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : PREFERRED_SELECT_BUTTON_LABEL}
      </button>
    );
  };

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
        title="בחירת דרך קבלת התשלום"
        accent="emerald"
        description="מספרים אופציונליים להורים אחרי המשמרת. התשלום מתבצע מחוץ ל-AnyNanny. לא מוצג בפרופיל הציבורי ולא מועתק ממספר הוואטסאפ."
        summary={
          loading
            ? "טוען…"
            : sitterReceivingSummary(
                sitterReceivingSetupState(methods, "bit").configured,
                sitterReceivingSetupState(methods, "paybox").configured
              )
        }
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-4 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">טוען מספרי קבלה…</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-right">
              <p className="text-[13px] font-semibold text-slate-500">בחירת דרך קבלת התשלום</p>
              <p
                className={`mt-1 text-sm ${
                  preferredReceivingMethodLabel(methods.preferred)
                    ? "font-bold text-[#001F3F]"
                    : "italic text-slate-400"
                }`}
              >
                {preferredReceivingMethodLabel(methods.preferred) || "לא הוגדר"}
              </p>
              {preferredError ? (
                <p className="mt-1 text-xs font-medium text-rose-700">{preferredError}</p>
              ) : null}
            </div>
            <div
              className={`rounded-xl border p-3 ${
                methods.preferred === "cash"
                  ? "border-emerald-200 bg-emerald-50/70"
                  : "border-slate-200 bg-slate-50/70"
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-[#0B3C5D]" aria-hidden />
                  <p className="text-sm font-bold text-[#001F3F]">מזומן</p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    methods.preferred === "cash"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {methods.preferred === "cash" ? "מועדף" : "לא נבחר"}
                </span>
              </div>
              <p className="text-[13px] text-slate-500">
                הצהרה בלבד — אין צורך במספר, לינק או פרטי חשבון.
              </p>
              {preferredButton("cash")}
            </div>
            <div
              className={`rounded-xl border p-3 ${
                methods.preferred === "bit"
                  ? "border-emerald-200 bg-emerald-50/70"
                  : "border-slate-200 bg-slate-50/70"
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-[#0B3C5D]" aria-hidden />
                  <p className="text-sm font-bold text-[#001F3F]">Bit</p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    methods.preferred === "bit"
                      ? "bg-emerald-100 text-emerald-800"
                      : sitterReceivingSetupState(methods, "bit").configured
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {methods.preferred === "bit"
                    ? "מועדף"
                    : sitterReceivingSetupState(methods, "bit").statusLabel}
                </span>
              </div>
              <p className="text-[13px] text-slate-500">
                {payoutMethodConfigured(methods, "bit")
                  ? `שמור: ${formatIsraeliMobileDisplay(methods.bitPhone)}`
                  : "לא הוגדר — ההורים לא יראו אפשרות Bit."}
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
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveBit()}
                  disabled={savingBit}
                  className="inline-flex min-h-[2.5rem] items-center justify-center rounded-xl bg-[#0B3C5D] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  {savingBit ? <Loader2 className="h-4 w-4 animate-spin" /> : "שמירת Bit"}
                </button>
                {preferredButton("bit")}
              </div>
            </div>

            <div
              className={`rounded-xl border p-3 ${
                methods.preferred === "paybox"
                  ? "border-emerald-200 bg-emerald-50/70"
                  : "border-slate-200 bg-slate-50/70"
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-[#0B3C5D]" aria-hidden />
                  <p className="text-sm font-bold text-[#001F3F]">PayBox</p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    methods.preferred === "paybox"
                      ? "bg-emerald-100 text-emerald-800"
                      : sitterReceivingSetupState(methods, "paybox").configured
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {methods.preferred === "paybox"
                    ? "מועדף"
                    : sitterReceivingSetupState(methods, "paybox").statusLabel}
                </span>
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
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void savePaybox()}
                  disabled={savingPaybox}
                  className="inline-flex min-h-[2.5rem] items-center justify-center rounded-xl bg-[#0B3C5D] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  {savingPaybox ? <Loader2 className="h-4 w-4 animate-spin" /> : "שמירת PayBox"}
                </button>
                {preferredButton("paybox")}
              </div>
              <div className="mt-4 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <label
                    htmlFor="sitter-paybox-personal-link"
                    className="min-w-0 text-right text-xs font-bold text-slate-600"
                  >
                    לינק אישי לקבלת תשלום ב-PayBox
                  </label>
                  <button
                    type="button"
                    onClick={() => setPayboxLinkHelpOpen((open) => !open)}
                    aria-expanded={payboxLinkHelpOpen}
                    aria-controls="sitter-paybox-personal-link-help"
                    className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[#0B6BCB] underline decoration-[#0B6BCB]/35 underline-offset-2 transition hover:text-[#08529a] hover:decoration-[#08529a]"
                  >
                    <HelpCircle className="h-3.5 w-3.5" aria-hidden />
                    {PAYBOX_PERSONAL_LINK_HELP_TOGGLE}
                  </button>
                </div>
                <input
                  id="sitter-paybox-personal-link"
                  className={fieldClassName}
                  dir="ltr"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://links.payboxapp.com/…"
                  value={payboxLink}
                  onChange={(e) => setPayboxLink(e.target.value)}
                  disabled={savingPayboxLink}
                />
                <p className="mt-1 text-[12px] font-medium text-slate-400">
                  אופציונלי. קישור HTTPS של PayBox בלבד.
                </p>
                {payboxLinkHelpOpen ? (
                  <div
                    id="sitter-paybox-personal-link-help"
                    className="mt-2 min-w-0 overflow-hidden break-words rounded-xl border border-slate-200/80 bg-white px-3 py-3 text-right text-[13px] leading-relaxed text-slate-600"
                    dir="rtl"
                  >
                    <p className="font-bold text-slate-700">{PAYBOX_PERSONAL_LINK_HELP_TITLE}</p>
                    <div className="mt-2 space-y-2 select-text">
                      {PAYBOX_PERSONAL_LINK_HELP_PARAGRAPHS.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                      <p
                        className="font-mono text-sm font-semibold tracking-tight text-slate-700"
                        dir="ltr"
                      >
                        {PAYBOX_PERSONAL_LINK_HELP_PREFIX}
                      </p>
                    </div>
                    <ol className="mt-3 list-decimal space-y-1 pr-5 text-[13px] text-slate-600 select-text">
                      {PAYBOX_PERSONAL_LINK_HELP_STEPS.map((step) => (
                        <li key={step} className="break-words pr-1">
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </div>
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
