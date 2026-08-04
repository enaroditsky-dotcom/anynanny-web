"use client";

import { useEffect, useState } from "react";
import { BillingInlineCheckout } from "@/components/billing/BillingInlineCheckout";

type CheckoutClientProps = {
  sessionId: string;
};

type IntentResponse = {
  clientSecret?: string;
  amount?: number;
  alreadyPaid?: boolean;
  error?: string;
};

type Phase = "loading" | "ready" | "paid" | "error";

export function CheckoutClient({ sessionId }: CheckoutClientProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [clientSecret, setClientSecret] = useState("");
  const [amountNis, setAmountNis] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setPhase("loading");
      setError(null);
      try {
        const res = await fetch("/api/stripe/payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId })
        });
        const data = (await res.json()) as IntentResponse;
        if (cancelled) return;

        if (!res.ok) {
          setError(data.error ?? "יצירת התשלום נכשלה.");
          setPhase("error");
          return;
        }

        if (data.alreadyPaid) {
          setAmountNis(data.amount ?? 0);
          setPhase("paid");
          return;
        }

        if (!data.clientSecret) {
          setError("לא התקבל מזהה תשלום מהשרת.");
          setPhase("error");
          return;
        }

        setClientSecret(data.clientSecret);
        setAmountNis(data.amount ?? 0);
        setPhase("ready");
      } catch {
        if (!cancelled) {
          setError("שגיאת רשת — נסו שוב.");
          setPhase("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (phase === "loading") {
    return (
      <p className="rounded-2xl border border-navy-header/10 bg-white px-4 py-6 text-center text-sm text-navy-800/70 shadow-soft">
        טוען עגלת תשלום…
      </p>
    );
  }

  if (phase === "paid") {
    return (
      <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm font-semibold text-emerald-800 shadow-soft">
        התשלום כבר בוצע
        {amountNis ? <span className="tabular-nums"> · ₪{amountNis.toFixed(2)}</span> : null} ✓
      </p>
    );
  }

  if (phase === "error") {
    return (
      <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-center text-sm font-semibold text-rose-800 shadow-soft">
        {error ?? "אירעה שגיאה."}
      </p>
    );
  }

  return (
    <BillingInlineCheckout
      clientSecret={clientSecret}
      amountNis={amountNis}
      onSuccess={() => setPhase("paid")}
      onError={(message) => {
        setError(message);
        setPhase("error");
      }}
    />
  );
}
