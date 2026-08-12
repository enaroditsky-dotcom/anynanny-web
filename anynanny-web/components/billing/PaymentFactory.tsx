"use client";

import Image from "next/image";
import { CreditCard, Loader2 } from "lucide-react";
import type { ParentPaymentMethod } from "@/lib/wallet/parent-payment-methods";
import { formatElapsed } from "@/lib/session/protocol";

type ParentCheckoutPaymentMethodUi =
  | "credit_card"
  | "bit"
  | "apple_pay"
  | "google_pay";

const PAYMENT_OPTIONS: {
  id: ParentCheckoutPaymentMethodUi;
  label: string;
  hint: string;
  logoSrc: string;
  logoAlt: string;
  logoShape: "circle" | "rounded";
  logoFit?: "cover" | "contain";
}[] = [
  {
    id: "credit_card",
    label: "כרטיס אשראי חדש",
    hint: "Visa · Mastercard · Isracard · Amex (+ Apple Pay / Google Pay אם זמין ב-HYP)",
    logoSrc: "/wallet/anny-avatar.png",
    logoAlt: "AnyNanny",
    logoShape: "circle"
  },
  {
    id: "bit",
    label: "Bit",
    hint: "נפתח ישירות למסך Bit ב־HYP",
    logoSrc: "/wallet/bit-logo.png",
    logoAlt: "Bit",
    logoShape: "rounded"
  },
  {
    id: "apple_pay",
    label: "Apple Pay",
    hint: "תשלום דרך Apple Pay ב־HYP",
    logoSrc: "/wallet/apple-pay-logo.png",
    logoAlt: "Apple Pay",
    logoShape: "rounded",
    logoFit: "contain"
  },
  {
    id: "google_pay",
    label: "Google Pay",
    hint: "תשלום דרך Google Pay ב־HYP",
    logoSrc: "/wallet/google-pay-logo.png",
    logoAlt: "Google Pay",
    logoShape: "rounded",
    logoFit: "contain"
  }
];

export type PaymentFactoryProps = {
  elapsedSeconds: number;
  sitterBaseNis: number;
  parentTotalNis: number;
  platformFeeNis: number;
  selectedMethod: ParentCheckoutPaymentMethodUi;
  onSelectMethod: (method: ParentCheckoutPaymentMethodUi) => void;
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
  platformFeeNis: _platformFeeNis,
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
    <div className="flex w-full shrink-0 flex-col items-stretch">
      <div className="w-full rounded-2xl bg-[#001F3F] px-4 py-5 shadow-[0_8px_28px_-8px_rgba(0,31,63,0.55)] ring-1 ring-[#001F3F]/25 sm:px-5 sm:py-6">
        <div className="flex w-full flex-col gap-4 text-center">
          <div className="space-y-2">
            <p className="text-base font-bold leading-snug text-white sm:text-lg">
              המשמרת הסתיימה!
            </p>
            <p className="text-sm font-semibold tabular-nums leading-snug text-white/95">
              {timerText}
            </p>
            <div className="space-y-0.5 text-[11px] font-medium leading-relaxed text-white/75 sm:text-xs">
              <p>בסיס ₪{sitterBaseNis.toFixed(2)}</p>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold text-white/80">סה״כ לתשלום</p>
            <p className="text-3xl font-extrabold tabular-nums tracking-tight text-emerald-300 sm:text-4xl">
              ₪{parentTotalNis.toFixed(2)}
            </p>
          </div>

          <div className="w-full border-t border-white/15" aria-hidden />

          <div className="w-full space-y-3 text-right">
            <p className="text-center text-sm font-bold text-white">בחר אמצעי תשלום</p>

            {savedMethodsLoading ? (
              <div className="flex items-center justify-center gap-2 py-2 text-xs text-white/70">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                <span>טוענים כרטיסים שמורים…</span>
              </div>
            ) : null}

            {savedMethods.length > 0 ? (
              <div className="grid grid-cols-1 gap-2.5">
                <p className="text-right text-[11px] font-medium text-white/65">כרטיסים שמורים</p>
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
                      className={`flex min-h-[3.25rem] w-full flex-row-reverse items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-sm font-bold transition ${
                        selected
                          ? "border-emerald-300 bg-emerald-600/30 text-white ring-1 ring-emerald-300/60"
                          : "border-white/15 bg-white/5 text-white/90 hover:border-white/30 hover:bg-white/10"
                      } disabled:cursor-not-allowed disabled:opacity-45`}
                    >
                      <CreditCard className="h-5 w-5 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-right">
                        {method.brandLabel} •••• {method.last4}
                        {method.is_default ? " · ברירת מחדל" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-2.5">
              {PAYMENT_OPTIONS.map(({ id, label, hint, logoSrc, logoAlt, logoShape, logoFit }) => {
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
                    className={`flex min-h-[4.25rem] w-full flex-row-reverse items-center justify-between gap-3 rounded-xl border px-3.5 py-3.5 text-sm font-bold transition ${
                      selected
                        ? "border-emerald-300 bg-emerald-600/30 text-white ring-1 ring-emerald-300/60"
                        : "border-white/15 bg-white/5 text-white/90 hover:border-white/30 hover:bg-white/10"
                    } disabled:cursor-not-allowed disabled:opacity-45`}
                  >
                    <span
                      className={`relative h-10 w-10 shrink-0 overflow-hidden bg-white ${
                        logoShape === "circle" ? "rounded-full" : "rounded-xl"
                      }`}
                    >
                      <Image
                        src={logoSrc}
                        alt={logoAlt}
                        fill
                        className={
                          logoFit === "contain"
                            ? "object-contain p-1"
                            : "object-cover"
                        }
                        sizes="40px"
                      />
                    </span>
                    <span className="min-w-0 flex-1 space-y-0.5 text-right">
                      <span className="block text-[15px] leading-tight">{label}</span>
                      <span className="block text-[11px] font-medium leading-snug text-white/60">
                        {hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {bookingChecking ? (
            <div
              className="flex items-center justify-center gap-2 py-1 text-xs text-white/70"
              aria-live="polite"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              <span>מאמתים פרטי משמרת…</span>
            </div>
          ) : null}

          {bookingReady && !bookingChecking && errorMessage ? (
            <p className="max-w-full text-center text-xs font-medium leading-snug text-rose-300">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="button"
            disabled={!canConfirm}
            onClick={onConfirm}
            className="mt-1 w-full rounded-xl bg-emerald-600 px-4 py-3.5 text-base font-bold text-white shadow-[0_6px_18px_-6px_rgba(16,185,129,0.65)] ring-1 ring-emerald-300/50 transition hover:bg-emerald-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
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
