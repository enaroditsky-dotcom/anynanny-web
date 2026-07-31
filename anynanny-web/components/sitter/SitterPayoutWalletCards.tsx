"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { ActionToast } from "@/components/ui/action-toast";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  EMPTY_SITTER_PAYOUT_METHODS,
  extractCardLast4,
  fetchSitterPayoutMethods,
  formatIsraeliMobileDisplay,
  payoutMethodConfigured,
  saveSitterPayoutMethods,
  type SitterPayoutMethodKind,
  type SitterPayoutMethods,
  validateBitPhone,
  validatePayboxPhone,
  validatePayoutCard
} from "@/lib/wallet/sitter-payout-methods";

type SitterPayoutWalletCardsProps = {
  sitterId: string;
};

const fieldClassName =
  "w-full appearance-none rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-[#0B3C5D]/40 focus:bg-white focus:ring-2 focus:ring-[#0B3C5D]/15 disabled:opacity-60";

function BrandIcon({
  src,
  alt,
  size = 32,
  fit = "cover"
}: {
  src: string;
  alt: string;
  size?: number;
  fit?: "cover" | "contain";
}) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5"
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        className={fit === "contain" ? "object-contain p-0.5" : "object-cover"}
        sizes={`${size}px`}
      />
    </div>
  );
}

function BitLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`relative inline-block h-6 w-6 overflow-hidden rounded-md ${className}`}>
      <Image src="/wallet/bit-logo.png" alt="Bit" fill className="object-cover" sizes="24px" />
    </span>
  );
}

function PayBoxLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`relative inline-block h-6 w-6 overflow-hidden rounded-md ${className}`}>
      <Image src="/wallet/paybox-logo.png" alt="PayBox" fill className="object-cover" sizes="24px" />
    </span>
  );
}

function statusLabel(methods: SitterPayoutMethods, kind: SitterPayoutMethodKind): string {
  if (kind === "bit") {
    if (!payoutMethodConfigured(methods, "bit")) return "מספר טלפון לא הוגדר";
    return formatIsraeliMobileDisplay(methods.bitPhone);
  }
  if (kind === "paybox") {
    if (!payoutMethodConfigured(methods, "paybox")) return "מספר טלפון לא הוגדר";
    return formatIsraeliMobileDisplay(methods.payboxPhone);
  }
  if (!payoutMethodConfigured(methods, "card")) return "פרטי כרטיס לא הוגדרו";
  const exp =
    methods.cardExpMonth && methods.cardExpYear
      ? ` · ${String(methods.cardExpMonth).padStart(2, "0")}/${String(methods.cardExpYear).slice(-2)}`
      : "";
  const holder = methods.cardHolder.trim();
  return holder ? `${holder} · •••• ${methods.cardLast4}${exp}` : `•••• ${methods.cardLast4}${exp}`;
}

export function SitterPayoutWalletCards({ sitterId }: SitterPayoutWalletCardsProps) {
  const [methods, setMethods] = useState<SitterPayoutMethods>({ ...EMPTY_SITTER_PAYOUT_METHODS });
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<SitterPayoutMethodKind | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !sitterId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchSitterPayoutMethods(supabase, sitterId);
      if (!result.missingSchema) {
        setMethods(result.methods ?? { ...EMPTY_SITTER_PAYOUT_METHODS });
      } else {
        setMethods({ ...EMPTY_SITTER_PAYOUT_METHODS });
      }
    } catch (err) {
      console.warn("[sitter-payout] failed to load methods:", err);
      setMethods({ ...EMPTY_SITTER_PAYOUT_METHODS });
    } finally {
      setLoading(false);
    }
  }, [sitterId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !editing) setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, editing]);

  const rows: Array<{
    kind: SitterPayoutMethodKind;
    title: string;
    accentClass: string;
    logo: ReactNode;
  }> = [
    {
      kind: "card",
      title: "כרטיס אשראי",
      accentClass: "border-[#0B3C5D]/15 bg-[#EEF4F8]",
      logo: <BrandIcon src="/anynanny-clean-transparent.png.jpg" alt="AnyNanny" fit="contain" />
    },
    {
      kind: "bit",
      title: "Bit",
      accentClass: "border-[#1BA7D9]/20 bg-[#EAF8FC]",
      logo: <BrandIcon src="/wallet/bit-logo.png" alt="Bit" />
    },
    {
      kind: "paybox",
      title: "PayBox",
      accentClass: "border-[#2E9FE6]/20 bg-[#EAF6FD]",
      logo: <BrandIcon src="/wallet/paybox-logo.png" alt="PayBox" />
    }
  ];

  return (
    <section dir="rtl">
      <button
        type="button"
        disabled={loading}
        onClick={() => setMenuOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FF8A8A] px-4 py-3.5 text-xs font-bold text-white shadow-soft transition hover:brightness-105 active:scale-[0.99] disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        אמצעי קבלת התשלום
      </button>

      {menuOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/45 p-3 sm:items-center"
          dir="rtl"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="סגור"
            onClick={() => {
              if (!editing) setMenuOpen(false);
            }}
          />
          <div className="relative z-[1] w-full max-w-md overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="סגור"
              >
                <X className="h-4 w-4" />
              </button>
              <h3 className="text-sm font-bold text-navy-header">אמצעי קבלת התשלום</h3>
              <span className="w-8" />
            </div>

            <div className="space-y-2 px-3 py-3">
              {rows.map((row) => {
                const ready = payoutMethodConfigured(methods, row.kind);
                return (
                  <div
                    key={row.kind}
                    className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 ${row.accentClass}`}
                  >
                    {row.logo}
                    <div className="min-w-0 flex-1 text-right">
                      <p className="text-xs font-bold text-slate-800">{row.title}</p>
                      <p className="truncate text-[10px] text-slate-500" dir="ltr">
                        {statusLabel(methods, row.kind)}
                      </p>
                    </div>
                    {ready ? (
                      <span className="hidden shrink-0 text-[9px] font-bold text-emerald-600 sm:inline">
                        מוכן
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setEditing(row.kind)}
                      className="shrink-0 text-[11px] font-bold text-[#0B3C5D] underline underline-offset-2 decoration-[#0B3C5D]/50 transition hover:text-[#FF8A8A] hover:decoration-[#FF8A8A]"
                    >
                      עדכון
                    </button>
                  </div>
                );
              })}
            </div>

            <p className="border-t border-slate-100 px-4 py-3 text-center text-[11px] text-slate-500">
              עדכון מאפשר לשמור מספר טלפון או פרטי כרטיס למשיכה.
            </p>
          </div>
        </div>
      ) : null}

      {editing ? (
        <PayoutEditSheet
          kind={editing}
          sitterId={sitterId}
          methods={methods}
          onClose={() => setEditing(null)}
          onSaved={(next, message) => {
            setMethods(next);
            setToast(message);
            setEditing(null);
          }}
        />
      ) : null}

      <ActionToast message={toast} onDismiss={() => setToast(null)} />
    </section>
  );
}

function PayoutEditSheet({
  kind,
  sitterId,
  methods,
  onClose,
  onSaved
}: {
  kind: SitterPayoutMethodKind;
  sitterId: string;
  methods: SitterPayoutMethods;
  onClose: () => void;
  onSaved: (methods: SitterPayoutMethods, message: string) => void;
}) {
  const [bitPhone, setBitPhone] = useState(methods.bitPhone);
  const [payboxPhone, setPayboxPhone] = useState(methods.payboxPhone);
  const [cardHolder, setCardHolder] = useState(methods.cardHolder);
  const [cardNumber, setCardNumber] = useState(
    methods.cardLast4 ? `•••• •••• •••• ${methods.cardLast4}` : ""
  );
  const [cardExpMonth, setCardExpMonth] = useState<number | "">(methods.cardExpMonth ?? "");
  const [cardExpYear, setCardExpYear] = useState<number | "">(methods.cardExpYear ?? "");
  const [setAsPreferred, setSetAsPreferred] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSucceeded, setSaveSucceeded] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving && !saveSucceeded) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving, saveSucceeded]);

  const title =
    kind === "bit" ? "פרטי Bit" : kind === "paybox" ? "פרטי PayBox" : "כרטיס AnyNanny למשיכה";

  const handleSave = async () => {
    setError(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("שירות הארנק אינו זמין כרגע.");
      return;
    }

    let patch: Partial<SitterPayoutMethods> & { preferred?: SitterPayoutMethodKind } = {};
    if (kind === "bit") {
      const v = validateBitPhone(bitPhone);
      if (v) {
        setError(v);
        return;
      }
      patch = { bitPhone, preferred: setAsPreferred ? "bit" : undefined };
    } else if (kind === "paybox") {
      const v = validatePayboxPhone(payboxPhone);
      if (v) {
        setError(v);
        return;
      }
      patch = { payboxPhone, preferred: setAsPreferred ? "paybox" : undefined };
    } else {
      const last4Source = /\d{4}/.test(cardNumber.replace(/\D/g, ""))
        ? cardNumber
        : methods.cardLast4;
      const month = cardExpMonth === "" ? null : Number(cardExpMonth);
      const year = cardExpYear === "" ? null : Number(cardExpYear);
      const v = validatePayoutCard({
        holder: cardHolder,
        last4OrNumber: last4Source,
        expMonth: month,
        expYear: year
      });
      if (v) {
        setError(v);
        return;
      }
      patch = {
        cardHolder,
        cardLast4: extractCardLast4(last4Source),
        cardExpMonth: month,
        cardExpYear: year,
        preferred: setAsPreferred ? "card" : undefined
      };
    }

    setSaving(true);
    const result = await saveSitterPayoutMethods(supabase, sitterId, patch);
    setSaving(false);

    if (!result.ok) {
      setError(
        result.missingSchema
          ? "עמודות אמצעי התשלום חסרות. הריצו את המיגרציה ב-Supabase."
          : result.error
      );
      return;
    }

    setSaveSucceeded(true);
    closeTimerRef.current = setTimeout(() => {
      onSaved(result.methods, "פרטי המשיכה נשמרו בהצלחה");
    }, 900);
  };

  const years = Array.from({ length: 16 }, (_, i) => new Date().getFullYear() + i);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/45 p-3 sm:items-center"
      dir="rtl"
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label="סגור" onClick={onClose} />
      <div className="relative z-[1] w-full max-w-md overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving || saveSucceeded}
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="סגור"
          >
            <X className="h-4 w-4" />
          </button>
          <h3 className="text-sm font-bold text-navy-header">{title}</h3>
          <span className="w-8" />
        </div>

        <div className="space-y-3 px-4 py-4">
          {kind === "bit" ? (
            <>
              <div className="flex items-center gap-2 rounded-2xl bg-[#EAF8FC] px-3 py-2">
                <BitLogo className="h-8 w-8" />
                <p className="text-[11px] text-slate-600">מספר הנייד המחובר לחשבון Bit שלכם</p>
              </div>
              <label className="block text-right text-xs font-bold text-slate-600">
                מספר טלפון
                <input
                  className={`${fieldClassName} mt-1.5`}
                  dir="ltr"
                  inputMode="tel"
                  placeholder="05X-XXX-XXXX"
                  value={bitPhone}
                  onChange={(e) => setBitPhone(e.target.value)}
                  disabled={saving || saveSucceeded}
                />
              </label>
            </>
          ) : null}

          {kind === "paybox" ? (
            <>
              <div className="flex items-center gap-2 rounded-2xl bg-[#EAF6FD] px-3 py-2">
                <PayBoxLogo className="h-8 w-8" />
                <p className="text-[11px] text-slate-600">מספר הנייד המחובר לחשבון PayBox שלכם</p>
              </div>
              <label className="block text-right text-xs font-bold text-slate-600">
                מספר טלפון
                <input
                  className={`${fieldClassName} mt-1.5`}
                  dir="ltr"
                  inputMode="tel"
                  placeholder="05X-XXX-XXXX"
                  value={payboxPhone}
                  onChange={(e) => setPayboxPhone(e.target.value)}
                  disabled={saving || saveSucceeded}
                />
              </label>
            </>
          ) : null}

          {kind === "card" ? (
            <>
              <div className="flex items-center gap-2 rounded-2xl bg-[#EEF4F8] px-3 py-2">
                <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full bg-white">
                  <Image
                    src="/anynanny-clean-transparent.png.jpg"
                    alt=""
                    fill
                    className="object-contain p-0.5"
                    sizes="28px"
                  />
                </div>
                <p className="text-[11px] text-slate-600">
                  פרטי כרטיס למשיכה ישירה — נשמרות רק 4 ספרות אחרונות ותוקף (ללא CVV).
                </p>
              </div>
              <label className="block text-right text-xs font-bold text-slate-600">
                שם בעל הכרטיס
                <input
                  className={`${fieldClassName} mt-1.5`}
                  value={cardHolder}
                  onChange={(e) => setCardHolder(e.target.value)}
                  disabled={saving || saveSucceeded}
                />
              </label>
              <label className="block text-right text-xs font-bold text-slate-600">
                מספר כרטיס
                <input
                  className={`${fieldClassName} mt-1.5`}
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  placeholder="XXXX XXXX XXXX XXXX"
                  value={cardNumber}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 19);
                    const groups = digits.match(/.{1,4}/g);
                    setCardNumber(groups ? groups.join(" ") : "");
                  }}
                  disabled={saving || saveSucceeded}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-right text-xs font-bold text-slate-600">
                  חודש
                  <select
                    className={`${fieldClassName} mt-1.5`}
                    value={cardExpMonth}
                    onChange={(e) => setCardExpMonth(e.target.value ? Number(e.target.value) : "")}
                    disabled={saving || saveSucceeded}
                  >
                    <option value="">MM</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {String(m).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-right text-xs font-bold text-slate-600">
                  שנה
                  <select
                    className={`${fieldClassName} mt-1.5`}
                    value={cardExpYear}
                    onChange={(e) => setCardExpYear(e.target.value ? Number(e.target.value) : "")}
                    disabled={saving || saveSucceeded}
                  >
                    <option value="">YYYY</option>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          ) : null}

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-xs font-semibold text-slate-700">
            <span>הגדר כאמצעי משיכה מועדף</span>
            <input
              type="checkbox"
              checked={setAsPreferred}
              onChange={(e) => setSetAsPreferred(e.target.checked)}
              disabled={saving || saveSucceeded}
              className="h-4 w-4 accent-[#0B3C5D]"
            />
          </label>

          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          ) : null}

          {saveSucceeded ? (
            <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> נשמר בהצלחה
            </p>
          ) : null}
        </div>

        <div className="border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || saveSucceeded}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0B3C5D] px-4 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            שמירת פרטים
          </button>
        </div>
      </div>
    </div>
  );
}
