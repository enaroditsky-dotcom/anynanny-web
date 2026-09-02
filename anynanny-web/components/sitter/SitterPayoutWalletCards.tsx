"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, Loader2, ShieldCheck, X } from "lucide-react";
import { ActionToast } from "@/components/ui/action-toast";
import {
  EMPTY_METHOD_HINT,
  WalletMethodCardRow,
  WalletMethodVisualCard
} from "@/components/wallet/wallet-method-brand";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  AUTH_MODAL_CENTER_WRAP,
  AUTH_MODAL_OVERLAY_SCROLL
} from "@/lib/ui/auth-modal-overlay";
import {
  EMPTY_SITTER_PAYOUT_METHODS,
  fetchSitterPayoutMethods,
  formatIsraeliMobileDisplay,
  payoutMethodConfigured,
  type SitterPayoutMethodKind,
  type SitterPayoutMethods,
  validateBitPhone,
  validatePayboxPhone,
  validatePayoutCard
} from "@/lib/wallet/sitter-payout-methods";

type SitterPayoutWalletCardsProps = {
  sitterId: string;
  /** Optional: bump from parent after Hyp return complete. */
  reloadToken?: number;
};

const fieldClassName =
  "w-full appearance-none rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-[#0B3C5D]/40 focus:bg-white focus:ring-2 focus:ring-[#0B3C5D]/15 disabled:opacity-60";

function statusLabel(methods: SitterPayoutMethods, kind: SitterPayoutMethodKind): string {
  if (kind === "bit") {
    if (!payoutMethodConfigured(methods, "bit")) return EMPTY_METHOD_HINT;
    return formatIsraeliMobileDisplay(methods.bitPhone);
  }
  if (kind === "paybox") {
    if (!payoutMethodConfigured(methods, "paybox")) return EMPTY_METHOD_HINT;
    return formatIsraeliMobileDisplay(methods.payboxPhone);
  }
  if (!payoutMethodConfigured(methods, "card")) return EMPTY_METHOD_HINT;
  const brand = methods.cardBrand.trim() ? `${methods.cardBrand} · ` : "";
  const exp =
    methods.cardExpMonth && methods.cardExpYear
      ? ` · ${String(methods.cardExpMonth).padStart(2, "0")}/${String(methods.cardExpYear).slice(-2)}`
      : "";
  const hyp = methods.hypTokenReady ? " · HYP מוכן" : "";
  return `${brand}•••• ${methods.cardLast4}${exp}${hyp}`;
}

function methodTitle(kind: SitterPayoutMethodKind): string {
  if (kind === "bit") return "Bit";
  if (kind === "paybox") return "PayBox";
  return "כרטיס אשראי";
}

export function SitterPayoutWalletCards({ sitterId, reloadToken = 0 }: SitterPayoutWalletCardsProps) {
  const [methods, setMethods] = useState<SitterPayoutMethods>({ ...EMPTY_SITTER_PAYOUT_METHODS });
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewing, setViewing] = useState<SitterPayoutMethodKind | null>(null);
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
  }, [reload, reloadToken]);

  useEffect(() => {
    if (!menuOpen) {
      setViewing(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || editing) return;
      if (viewing) setViewing(null);
      else setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, editing, viewing]);

  const rows: Array<{ kind: SitterPayoutMethodKind }> = [
    { kind: "card" },
    { kind: "bit" },
    { kind: "paybox" }
  ];

  const closeMenu = () => {
    if (editing) return;
    setViewing(null);
    setMenuOpen(false);
  };

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
          className={`fixed inset-0 z-[80] ${AUTH_MODAL_OVERLAY_SCROLL} bg-slate-900/45`}
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sitter-payout-methods-title"
          onClick={closeMenu}
        >
          <div className={AUTH_MODAL_CENTER_WRAP}>
          <div
            className="my-auto w-full max-w-md overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              {viewing ? (
                <button
                  type="button"
                  onClick={() => setViewing(null)}
                  className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100"
                  aria-label="חזרה"
                >
                  <ChevronLeft className="h-4 w-4 rotate-180" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={closeMenu}
                  className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="סגור"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <h3 id="sitter-payout-methods-title" className="text-sm font-bold text-navy-header">
                {viewing ? methodTitle(viewing) : "אמצעי קבלת התשלום"}
              </h3>
              <span className="w-8" />
            </div>

            {viewing ? (
              <SitterMethodDetails
                kind={viewing}
                methods={methods}
                onUpdate={() => setEditing(viewing)}
              />
            ) : (
              <>
                <div className="space-y-3 px-3 py-3">
                  {rows.map((row) => {
                    const ready = payoutMethodConfigured(methods, row.kind);
                    return (
                      <WalletMethodCardRow
                        key={row.kind}
                        kind={row.kind}
                        status={statusLabel(methods, row.kind)}
                        ready={ready}
                        cardTitle={methodTitle(row.kind)}
                        onOpen={() => {
                          if (ready) setViewing(row.kind);
                          else setEditing(row.kind);
                        }}
                        onUpdate={() => setEditing(row.kind)}
                      />
                    );
                  })}
                </div>
                <p className="border-t border-slate-100 px-4 py-3 text-center text-[13px] text-slate-500">
                  כרטיס שמור ניתן לפתוח לצפייה בפרטים מוסתרים. הכספים מעובדים באופן מאובטח דרך שער התשלומים המורשה HYP.
                </p>
              </>
            )}
          </div>
          </div>
        </div>
      ) : null}

      {editing ? (
        <PayoutEditSheet
          kind={editing}
          methods={methods}
          onClose={() => setEditing(null)}
          onSaved={(next, message) => {
            setMethods(next);
            setToast(message);
            setEditing(null);
            setViewing(editing);
          }}
        />
      ) : null}

      <ActionToast message={toast} onDismiss={() => setToast(null)} />
    </section>
  );
}

function SitterMethodDetails({
  kind,
  methods,
  onUpdate
}: {
  kind: SitterPayoutMethodKind;
  methods: SitterPayoutMethods;
  onUpdate: () => void;
}) {
  return (
    <div className="space-y-3 px-4 py-4">
      <WalletMethodVisualCard
        kind={kind}
        status={statusLabel(methods, kind)}
        ready={payoutMethodConfigured(methods, kind)}
        compact={false}
        cardTitle={methodTitle(kind)}
      />

      {kind === "card" && methods.cardHolder.trim() ? (
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-right">
          <p className="text-[12px] font-semibold text-slate-400">שם בעל הכרטיס</p>
          <p className="mt-0.5 text-xs font-bold text-slate-800">{methods.cardHolder}</p>
        </div>
      ) : null}

      {kind === "card" && methods.hypTokenReady ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-2.5 text-right text-xs font-semibold text-emerald-800">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          כרטיס רשום ב־HYP — מוכן למשיכות חיות
        </div>
      ) : null}

      {(kind === "bit" || kind === "paybox") && payoutMethodConfigured(methods, kind) ? (
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-right">
          <p className="text-[12px] font-semibold text-slate-400">מספר טלפון רשום</p>
          <p className="mt-0.5 text-xs font-bold text-slate-800" dir="ltr">
            {kind === "bit"
              ? formatIsraeliMobileDisplay(methods.bitPhone)
              : formatIsraeliMobileDisplay(methods.payboxPhone)}
          </p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onUpdate}
        className="w-full rounded-2xl bg-[#0B3C5D] px-4 py-3 text-sm font-bold text-white transition hover:brightness-110"
      >
        עדכון פרטים
      </button>
    </div>
  );
}

async function postPayoutMethods(body: Record<string, unknown>): Promise<{
  ok: boolean;
  methods?: SitterPayoutMethods;
  error?: string;
  missingSchema?: boolean;
}> {
  const res = await fetch("/api/sitter/payout-methods", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body)
  });
  let data: {
    methods?: SitterPayoutMethods;
    error?: string;
    missingSchema?: boolean;
  } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: data.error || `שמירה נכשלה (${res.status}).`,
      missingSchema: data.missingSchema === true
    };
  }
  return { ok: true, methods: data.methods };
}

function PayoutEditSheet({
  kind,
  methods,
  onClose,
  onSaved
}: {
  kind: SitterPayoutMethodKind;
  methods: SitterPayoutMethods;
  onClose: () => void;
  onSaved: (methods: SitterPayoutMethods, message: string) => void;
}) {
  const [bitPhone, setBitPhone] = useState(methods.bitPhone);
  const [payboxPhone, setPayboxPhone] = useState(methods.payboxPhone);
  const [cardHolder, setCardHolder] = useState(methods.cardHolder);
  const [cardIdNumber, setCardIdNumber] = useState(methods.cardIdNumber);
  const [cardCvv, setCardCvv] = useState("");
  const [cardNumber, setCardNumber] = useState(
    methods.cardLast4 ? `•••• •••• •••• ${methods.cardLast4}` : ""
  );
  const [cardExpMonth, setCardExpMonth] = useState<number | "">(methods.cardExpMonth ?? "");
  const [cardExpYear, setCardExpYear] = useState<number | "">(methods.cardExpYear ?? "");
  const [setAsPreferred, setSetAsPreferred] = useState(true);
  const [registerWithHyp, setRegisterWithHyp] = useState(!methods.hypTokenReady);
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

    if (kind === "bit") {
      const v = validateBitPhone(bitPhone);
      if (v) {
        setError(v);
        return;
      }
      setSaving(true);
      const result = await postPayoutMethods({
        kind: "bit",
        bitPhone,
        preferred: setAsPreferred
      });
      setSaving(false);
      if (!result.ok || !result.methods) {
        setError(
          result.missingSchema
            ? "עמודות אמצעי התשלום חסרות. הריצו את המיגרציה ב-Supabase."
            : result.error || "שמירה נכשלה."
        );
        return;
      }
      setSaveSucceeded(true);
      closeTimerRef.current = setTimeout(() => {
        onSaved(result.methods!, "פרטי המשיכה נשמרו בהצלחה");
      }, 900);
      return;
    }

    if (kind === "paybox") {
      const v = validatePayboxPhone(payboxPhone);
      if (v) {
        setError(v);
        return;
      }
      setSaving(true);
      const result = await postPayoutMethods({
        kind: "paybox",
        payboxPhone,
        preferred: setAsPreferred
      });
      setSaving(false);
      if (!result.ok || !result.methods) {
        setError(
          result.missingSchema
            ? "עמודות אמצעי התשלום חסרות. הריצו את המיגרציה ב-Supabase."
            : result.error || "שמירה נכשלה."
        );
        return;
      }
      setSaveSucceeded(true);
      closeTimerRef.current = setTimeout(() => {
        onSaved(result.methods!, "פרטי המשיכה נשמרו בהצלחה");
      }, 900);
      return;
    }

    const digitsOnly = cardNumber.replace(/\D/g, "");
    const isMaskedExisting =
      cardNumber.includes("•") && /^\d{4}$/.test(methods.cardLast4) && digitsOnly.length <= 4;
    const last4Source = isMaskedExisting ? methods.cardLast4 : cardNumber;
    const month = cardExpMonth === "" ? null : Number(cardExpMonth);
    const year = cardExpYear === "" ? null : Number(cardExpYear);
    const v = validatePayoutCard({
      holder: cardHolder,
      last4OrNumber: last4Source,
      expMonth: month,
      expYear: year,
      idNumber: cardIdNumber,
      cvv: cardCvv,
      requireCvv: !isMaskedExisting || Boolean(cardCvv) || registerWithHyp
    });
    if (v) {
      setError(v);
      return;
    }

    setSaving(true);
    try {
      const result = await postPayoutMethods({
        kind: "card",
        preferred: setAsPreferred,
        cardHolder,
        cardNumber: isMaskedExisting ? methods.cardLast4 : cardNumber.replace(/\D/g, ""),
        cardExpMonth: month,
        cardExpYear: year,
        cardIdNumber,
        // CVV is validated server-side then discarded — never written to Postgres.
        cardCvv
      });

      if (!result.ok || !result.methods) {
        setError(
          result.missingSchema
            ? "עמודות אמצעי התשלום חסרות. הריצו את המיגרציה ב-Supabase."
            : result.error || "שמירה נכשלה."
        );
        return;
      }

      if (registerWithHyp) {
        const hypRes = await fetch("/api/sitter/payout-methods/hyp-register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            sitterName: cardHolder,
            cardHolder,
            cardIdNumber
          })
        });
        let hypData: { url?: string; error?: string } = {};
        try {
          hypData = (await hypRes.json()) as typeof hypData;
        } catch {
          /* ignore */
        }
        if (!hypRes.ok || !hypData.url) {
          // Metadata already saved — surface Hyp issue but keep success path soft.
          setSaveSucceeded(true);
          closeTimerRef.current = setTimeout(() => {
            onSaved(
              result.methods!,
              hypData.error
                ? `פרטי הכרטיס נשמרו. רישום HYP: ${hypData.error}`
                : "פרטי הכרטיס נשמרו (ללא טוקן HYP עדיין)"
            );
          }, 900);
          return;
        }
        window.location.assign(hypData.url);
        return;
      }

      setSaveSucceeded(true);
      closeTimerRef.current = setTimeout(() => {
        onSaved(result.methods!, "פרטי המשיכה נשמרו בהצלחה");
      }, 900);
    } finally {
      setSaving(false);
      setCardCvv("");
    }
  };

  const years = Array.from({ length: 16 }, (_, i) => new Date().getFullYear() + i);

  return (
    <div
      className={`fixed inset-0 z-[80] ${AUTH_MODAL_OVERLAY_SCROLL} bg-slate-900/45`}
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sitter-payout-edit-title"
      onClick={onClose}
    >
      <div className={AUTH_MODAL_CENTER_WRAP}>
      <div
        className="my-auto w-full max-w-md overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
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
          <h3 id="sitter-payout-edit-title" className="text-sm font-bold text-navy-header">{title}</h3>
          <span className="w-8" />
        </div>

        <div className="space-y-3 px-4 py-4">
          <WalletMethodVisualCard kind={kind} compact cardTitle={methodTitle(kind)} />

          {kind === "bit" ? (
            <>
              <p className="text-[13px] text-slate-600">מספר הנייד המחובר לחשבון Bit שלכם</p>
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
              <p className="text-[13px] text-slate-600">מספר הנייד המחובר לחשבון PayBox שלכם</p>
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
              <p className="text-[13px] text-slate-600">
                פרטי כרטיס למשיכה — במסד נשמרות רק 4 ספרות אחרונות, תוקף, שם ות.ז. מספר מלא ו־CVV
                משמשים לאימות ורישום HYP בלבד ואינם נשמרים.
              </p>
              <label className="block text-right text-xs font-bold text-slate-600">
                שם בעל הכרטיס
                <input
                  className={`${fieldClassName} mt-1.5`}
                  value={cardHolder}
                  onChange={(e) => setCardHolder(e.target.value)}
                  disabled={saving || saveSucceeded}
                  autoComplete="cc-name"
                />
              </label>
              <label className="block text-right text-xs font-bold text-slate-600">
                תעודת זהות
                <input
                  className={`${fieldClassName} mt-1.5`}
                  dir="ltr"
                  inputMode="numeric"
                  placeholder="XXXXXXXXX"
                  maxLength={9}
                  value={cardIdNumber}
                  onChange={(e) => setCardIdNumber(e.target.value.replace(/\D/g, "").slice(0, 9))}
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
              <label className="block text-right text-xs font-bold text-slate-600">
                CVV
                <input
                  className={`${fieldClassName} mt-1.5`}
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  placeholder="•••"
                  maxLength={4}
                  value={cardCvv}
                  onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  disabled={saving || saveSucceeded}
                />
              </label>
              <p className="text-[12px] text-slate-400">
                CVV מאומת בטופס בלבד ואינו נשמר במסד הנתונים (PCI).
              </p>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-xs font-semibold text-slate-700">
                <span>רישום מאובטח ב־HYP למשיכות חיות</span>
                <input
                  type="checkbox"
                  checked={registerWithHyp}
                  onChange={(e) => setRegisterWithHyp(e.target.checked)}
                  disabled={saving || saveSucceeded}
                  className="h-4 w-4 accent-[#0B3C5D]"
                />
              </label>
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
            {kind === "card" && registerWithHyp ? "שמירה והמשך ל־HYP" : "שמירת פרטים"}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
