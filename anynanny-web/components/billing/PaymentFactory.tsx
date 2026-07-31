"use client";

import { CreditCard, Loader2, Smartphone, Wallet } from "lucide-react";
import type { CheckoutPaymentMethod } from "@/lib/billing/checkout-payment-method";
import type { ParentPaymentMethod } from "@/lib/wallet/parent-payment-methods";
import { formatElapsed } from "@/lib/session/protocol";

const PAYMENT_OPTIONS: {
  id: CheckoutPaymentMethod;
  label: string;
  hint: string;
  icon: typeof CreditCard;
}[] = [
  {
    id: "credit_card",
    label: "כרטיס אשראי חדש",
    hint: "Visa · Mastercard · Isracard · Amex (+ Apple Pay / Google Pay אם זמין ב-HYP)",
    icon: CreditCard
  },
  { id: "bit", label: "Bit", hint: "דרך עמוד התשלום של HYP", icon: Smartphone },
  { id: "paybox", label: "Paybox", hint: "דרך עמוד התשלום של HYP", icon: Wallet }
];

export type PaymentFactoryProps = {
  elapsedSeconds: number;
  sitterBaseNis: number;
  parentTotalNis: number;
  platformFeeNis: number;
  selectedMethod: CheckoutPaymentMethod;
  onSelectMethod: (method: CheckoutPaymentMethod) => void;
  savedMethods?: ParentPaymentMethod[];
  selectedSavedMethodId?: string | null;
  onSelectSavedMethod?: (methodId: string | null) => void;
  savedMethodsLoading?: boolean;
  busy?: boolean;
  bookingChecking?: boolean;
  bookingReady?: boolean;
  errorMessage?: string | null;
  onConfirm: () => void;
};

/** Shift settlement payment picker — saved cards + Hyp hosted methods. */
export function PaymentFactory({
  elapsedSeconds,
  sitterBaseNis,
  parentTotalNis,
  platformFeeNis,
  selectedMethod,
  onSelectMethod,
  savedMethods = [],
  selectedSavedMethodId = null,
  onSelectSavedMethod,
  savedMethodsLoading = false,
  busy = false,
  bookingChecking = false,
  bookingReady = true,
  errorMessage,
  onConfirm
}: PaymentFactoryProps) {
  const timerText = formatElapsed(elapsedSeconds);
  const usingSavedCard = Boolean(selectedSavedMethodId);
  const canConfirm =
    (usingSavedCard || Boolean(selectedMethod)) && !busy && bookingReady && !bookingChecking;

  return (
    <div className="flex w-full shrink-0 flex-col items-center">
      <div className="w-full max-w-[15rem] rounded-xl bg-[#001F3F] px-2.5 py-2 shadow-[0_6px_20px_-6px_rgba(0,31,63,0.5)] ring-1 ring-[#001F3F]/20">
        <div className="flex flex-col items-center gap-1.5 text-center">
          <p className="text-[11px] font-bold leading-tight text-white">המשמרת הסתיימה!</p>
          <p className="text-[10px] font-semibold tabular-nums leading-snug text-white/95">
            {timerText} · בסיס ₪{sitterBaseNis.toFixed(2)}
          </p>
          <p className="text-[9px] font-medium text-white/80">
            עמלת פלטפורמה (10%): ₪{platformFeeNis.toFixed(2)}
          </p>
          <p className="text-[11px] font-bold tabular-nums text-emerald-300">
            סה״כ לתשלום: ₪{parentTotalNis.toFixed(2)}
          </p>

          <div className="w-full border-t border-white/10 pt-1.5">
            <p className="mb-1 text-[10px] font-semibold text-white/90">בחרו אמצעי תשלום</p>

            {savedMethodsLoading ? (
              <div className="mb-1.5 flex items-center justify-center gap-1.5 py-1 text-[10px] text-white/70">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                <span>טוענים כרטיסים שמורים…</span>
              </div>
            ) : null}

            {savedMethods.length > 0 ? (
              <div className="mb-1.5 grid grid-cols-1 gap-1">
                <p className="text-right text-[9px] font-medium text-white/70">כרטיסים שמורים</p>
                {savedMethods.map((method) => {
                  const selected = selectedSavedMethodId === method.id;
                  return (
                    <button
                      key={method.id}
                      type="button"
                      disabled={busy || bookingChecking || !bookingReady}
                      onClick={() => {
                        onSelectSavedMethod?.(method.id);
                        onSelectMethod("credit_card");
                      }}
                      className={`flex w-full flex-row-reverse items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-[10px] font-bold transition ${
                        selected
                          ? "border-emerald-300 bg-emerald-600/30 text-white ring-1 ring-emerald-300/60"
                          : "border-white/15 bg-white/5 text-white/90 hover:border-white/30 hover:bg-white/10"
                      } disabled:cursor-not-allowed disabled:opacity-45`}
                    >
                      <CreditCard className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-right">
                        {method.brandLabel} •••• {method.last4}
                        {method.is_default ? " · ברירת מחדל" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-1">
              {PAYMENT_OPTIONS.map(({ id, label, hint, icon: Icon }) => {
                const selected = !usingSavedCard && selectedMethod === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={busy || bookingChecking || !bookingReady}
                    onClick={() => {
                      onSelectSavedMethod?.(null);
                      onSelectMethod(id);
                    }}
                    className={`flex w-full flex-row-reverse items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-[10px] font-bold transition ${
                      selected
                        ? "border-emerald-300 bg-emerald-600/30 text-white ring-1 ring-emerald-300/60"
                        : "border-white/15 bg-white/5 text-white/90 hover:border-white/30 hover:bg-white/10"
                    } disabled:cursor-not-allowed disabled:opacity-45`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 text-right">
                      <span className="block">{label}</span>
                      <span className="block text-[8px] font-medium text-white/60">{hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {bookingChecking ? (
            <div
              className="flex items-center justify-center gap-1.5 py-0.5 text-[10px] text-white/70"
              aria-live="polite"
            >
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              <span>מאמתים פרטי משמרת…</span>
            </div>
          ) : null}

          {bookingReady && !bookingChecking && errorMessage ? (
            <p className="max-w-full text-[9px] font-medium leading-snug text-rose-300">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="button"
            disabled={!canConfirm}
            onClick={onConfirm}
            className="mt-0.5 w-full rounded-lg bg-emerald-600 px-2.5 py-2 text-[11px] font-bold text-white ring-1 ring-emerald-300/50 transition hover:bg-emerald-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy
              ? "מעבדים תשלום…"
              : usingSavedCard
                ? "חיוב כרטיס שמור"
                : "אישור ותשלום"}
          </button>
        </div>
      </div>
    </div>
  );
}
