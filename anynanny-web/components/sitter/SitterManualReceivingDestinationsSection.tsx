"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { ChevronDown, HelpCircle, Loader2 } from "lucide-react";
import { ActionToast } from "@/components/ui/action-toast";
import { sitterReceivingSummary } from "@/components/personal-area/personal-area-summaries";
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
  onMethodsChange?: (methods: SitterPayoutMethods) => void;
};

const fieldClassName =
  "mt-1.5 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-base font-semibold text-slate-800 outline-none transition focus:border-[#0B3C5D]/40 focus:bg-white focus:ring-2 focus:ring-[#0B3C5D]/15 disabled:opacity-60";

const accordionShellClass =
  "min-w-0 overflow-hidden rounded-2xl shadow-[0_10px_18px_-14px_rgba(122,86,24,0.85),0_1px_0_rgba(255,255,255,0.65)]";
const accordionHeaderClass =
  "relative flex h-14 w-full min-w-0 items-center gap-3 overflow-hidden bg-gradient-to-b from-[#FBF6E6] via-[#F0D48C] to-[#E4BE6A] px-3 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-2px_0_rgba(154,110,36,0.28)] transition-[filter] active:brightness-[0.98]";
const accordionIconClass =
  "relative z-[1] h-11 w-11 shrink-0 overflow-hidden rounded-[13px] shadow-[0_2px_5px_rgba(92,62,12,0.22),inset_0_0_0_1px_rgba(255,255,255,0.28)]";
const accordionChevronClass =
  "relative z-[1] h-5 w-5 shrink-0 text-[#7A5720] transition-transform";
const accordionPanelClass =
  "space-y-2 border-t border-[#E4C98A] bg-white px-3 py-3 scroll-mb-[calc(7rem+env(safe-area-inset-bottom,0px))]";

function MethodName({ cardTitle }: { cardTitle: string }) {
  return <span className="sr-only">{cardTitle}</span>;
}

function GoldSheen() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <span className="wallet-gold-sheen absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent" />
    </span>
  );
}

function ReceivingMethodShell({
  kind,
  children
}: {
  kind: "cash" | "bit" | "paybox";
  children: ReactNode;
}) {
  return (
    <div data-receiving-method={kind} className={accordionShellClass}>
      {children}
    </div>
  );
}

export const PAYBOX_PERSONAL_LINK_HELP_TOGGLE = "הסבר";
export const PAYBOX_PERSONAL_LINK_HELP_BUSINESS = [
  "אפשרות זו מיועדת למשתמשי PayBox Business.",
  "אם ברצונך להשתמש בקישור אישי לקבלת תשלום, יש להסדיר ולהפעיל את השירות ישירות מול PayBox."
] as const;
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
  sitterId,
  onMethodsChange
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
  const [cashOpen, setCashOpen] = useState(false);
  const [bitOpen, setBitOpen] = useState(false);
  const [payboxOpen, setPayboxOpen] = useState(false);
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
    onMethodsChange?.(result.methods);
    setLoading(false);
  }, [sitterId, onMethodsChange]);

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
    onMethodsChange?.(result.methods);
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
        className="inline-flex min-h-[2.5rem] items-center justify-center rounded-xl bg-[#0B3C5D] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
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
    onMethodsChange?.(result.methods);
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
    onMethodsChange?.(result.methods);
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
    onMethodsChange?.(result.methods);
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
    onMethodsChange?.(result.methods);
    setToast("לינק PayBox הוסר.");
  };

  const bitReady = sitterReceivingSetupState(methods, "bit").configured;
  const payboxReady = sitterReceivingSetupState(methods, "paybox").configured;
  const receivingSummary = loading
    ? "טוען…"
    : sitterReceivingSummary(bitReady, payboxReady);

  const preferredMark = (kind: "cash" | "bit" | "paybox") =>
    methods.preferred === kind ? (
      <span className="relative z-[1] inline-flex items-center rounded-full bg-white/60 px-2 py-0.5 text-[11px] font-semibold text-[#6A4B16] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
        מועדף
      </span>
    ) : null;

  return (
    <>
      <section
        className="min-w-0 space-y-2 text-right"
        data-tour="sitter-payment-methods-panel"
      >
        <p className="sr-only" data-tour="sitter-preferred-payment" title="בחירת דרך קבלת התשלום">
          {preferredReceivingMethodLabel(methods.preferred) || "לא הוגדר"}
          {" · "}
          {receivingSummary}
        </p>
        {preferredError ? (
          <p className="text-xs font-medium text-rose-700">{preferredError}</p>
        ) : null}

        <style>{`
          @keyframes wallet-gold-sheen {
            0%, 68% { transform: translateX(-150%) skewX(-18deg); opacity: 0; }
            76% { opacity: 0.85; }
            90% { transform: translateX(340%) skewX(-18deg); opacity: 0; }
            100% { transform: translateX(340%) skewX(-18deg); opacity: 0; }
          }
          .wallet-gold-sheen { animation: wallet-gold-sheen 7.5s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) {
            .wallet-gold-sheen { animation: none; opacity: 0.45; transform: translateX(70%) skewX(-18deg); }
          }
        `}</style>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-4 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">טוען מספרי קבלה…</span>
          </div>
        ) : (
          <div className="space-y-2">
            <ReceivingMethodShell kind="cash">
              <button
                type="button"
                aria-expanded={cashOpen}
                aria-controls="sitter-cash-receiving-panel"
                onClick={() => setCashOpen((open) => !open)}
                className={accordionHeaderClass}
              >
                <GoldSheen />
                <span className={accordionIconClass} aria-hidden>
                  <span className="flex h-full w-full items-center justify-center bg-gradient-to-b from-[#FFF9EC] to-[#F4E2B4] text-[1.7rem] font-extrabold leading-none text-[#6A4B16]">
                    ₪
                  </span>
                </span>
                <MethodName cardTitle="מזומן" />
                <span className="min-w-0 flex-1">{preferredMark("cash")}</span>
                <ChevronDown
                  className={`${accordionChevronClass} ${cashOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              {cashOpen ? (
                <div id="sitter-cash-receiving-panel" className={accordionPanelClass}>
                  <p className="text-[13px] leading-relaxed text-slate-500">
                    הצהרה בלבד — אין צורך במספר, לינק או פרטי חשבון.
                  </p>
                  {methods.preferred === "cash" ? (
                    <p className="text-[12px] font-medium text-slate-500">זו דרך הקבלה המועדפת.</p>
                  ) : null}
                  {preferredButton("cash")}
                </div>
              ) : null}
            </ReceivingMethodShell>

            <ReceivingMethodShell kind="bit">
              <button
                type="button"
                aria-expanded={bitOpen}
                aria-controls="sitter-bit-receiving-panel"
                onClick={() => setBitOpen((open) => !open)}
                className={accordionHeaderClass}
              >
                <GoldSheen />
                <span className={accordionIconClass}>
                  <Image
                    src="/wallet/bit-logo.png"
                    alt=""
                    fill
                    sizes="44px"
                    className="origin-center scale-[1.26] object-cover"
                    style={{ objectPosition: "41% 50%" }}
                  />
                </span>
                <MethodName cardTitle="Bit" />
                <span className="min-w-0 flex-1">{preferredMark("bit")}</span>
                <ChevronDown
                  className={`${accordionChevronClass} ${bitOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              {bitOpen ? (
                <div id="sitter-bit-receiving-panel" className={accordionPanelClass}>
                  <p className="text-[12px] leading-relaxed text-slate-500">
                    {payoutMethodConfigured(methods, "bit")
                      ? `שמור: ${formatIsraeliMobileDisplay(methods.bitPhone)}`
                      : sitterReceivingSetupState(methods, "bit").statusLabel}
                  </p>
                  <label className="block text-right text-xs font-bold text-slate-600">
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
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void saveBit()}
                      disabled={savingBit}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#0B3C5D] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {savingBit ? <Loader2 className="h-4 w-4 animate-spin" /> : "שמירת Bit"}
                    </button>
                    {preferredButton("bit")}
                  </div>
                </div>
              ) : null}
            </ReceivingMethodShell>

            <ReceivingMethodShell kind="paybox">
              <button
                type="button"
                aria-expanded={payboxOpen}
                aria-controls="sitter-paybox-receiving-panel"
                onClick={() => setPayboxOpen((open) => !open)}
                className={accordionHeaderClass}
              >
                <GoldSheen />
                <span className={accordionIconClass}>
                  <Image
                    src="/wallet/paybox-logo.png"
                    alt=""
                    fill
                    sizes="44px"
                    className="object-cover"
                  />
                </span>
                <MethodName cardTitle="PayBox" />
                <span className="min-w-0 flex-1">{preferredMark("paybox")}</span>
                <ChevronDown
                  className={`${accordionChevronClass} ${payboxOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              {payboxOpen ? (
                <div id="sitter-paybox-receiving-panel" className={accordionPanelClass}>
              <p className="text-[12px] leading-relaxed text-slate-500">
                {payboxManualReceivingConfigured(methods)
                  ? [
                      payoutMethodConfigured(methods, "paybox")
                        ? `מספר שמור: ${formatIsraeliMobileDisplay(methods.payboxPhone)}`
                        : null,
                      methods.payboxLink.trim() ? "לינק אישי שמור" : null
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : sitterReceivingSetupState(methods, "paybox").statusLabel}
              </p>
              <label className="block text-right text-xs font-bold text-slate-600">
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
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void savePaybox()}
                  disabled={savingPaybox}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#0B3C5D] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  {savingPaybox ? <Loader2 className="h-4 w-4 animate-spin" /> : "שמירת PayBox"}
                </button>
                {preferredButton("paybox")}
              </div>
              <div className="min-w-0">
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
                    <div className="space-y-2 select-text">
                      {PAYBOX_PERSONAL_LINK_HELP_BUSINESS.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                    </div>
                    <p className="mt-3 font-bold text-slate-700">{PAYBOX_PERSONAL_LINK_HELP_TITLE}</p>
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
              <div className="flex flex-wrap gap-2">
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
              ) : null}
            </ReceivingMethodShell>
          </div>
        )}
      </section>
      <ActionToast message={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
