"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import {
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  Loader2,
  RefreshCw,
  ArrowLeft,
  X
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { MainLayout } from "@/components/layout/MainLayout";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchParentWalletView } from "@/lib/wallet/parent-wallet";
import type { BillingTransaction } from "@/lib/wallet/billing-transactions";
import type { ParentPaymentMethod } from "@/lib/wallet/parent-payment-methods";
import type { CheckoutPaymentMethod } from "@/lib/billing/checkout-payment-method";

type PaymentOptionId = Extract<CheckoutPaymentMethod, "credit_card" | "bit" | "paybox">;

const PAYMENT_OPTIONS: Array<{
  id: PaymentOptionId;
  label: string;
  accentClass: string;
  hint: string;
}> = [
  {
    id: "credit_card",
    label: "כרטיס אשראי",
    accentClass: "border-[#0B3C5D]/15 bg-[#EEF4F8]",
    hint: "AnyNanny · Visa / Mastercard"
  },
  {
    id: "bit",
    label: "Bit",
    accentClass: "border-[#1BA7D9]/20 bg-[#EAF8FC]",
    hint: "תשלום מהיר ב-Bit"
  },
  {
    id: "paybox",
    label: "PayBox",
    accentClass: "border-[#2E9FE6]/20 bg-[#EAF6FD]",
    hint: "תשלום מהיר ב-PayBox"
  }
];

function BrandIcon({
  src,
  alt,
  fit = "cover"
}: {
  src: string;
  alt: string;
  fit?: "cover" | "contain";
}) {
  return (
    <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5">
      <Image
        src={src}
        alt={alt}
        fill
        className={fit === "contain" ? "object-contain p-0.5" : "object-cover"}
        sizes="32px"
      />
    </div>
  );
}

function PaymentOptionLogo({ id }: { id: PaymentOptionId }) {
  if (id === "bit") return <BrandIcon src="/wallet/bit-logo.png" alt="Bit" />;
  if (id === "paybox") return <BrandIcon src="/wallet/paybox-logo.png" alt="PayBox" />;
  return (
    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-[#0B3C5D] to-[#163A5F] shadow-sm ring-1 ring-[#0B3C5D]/20">
      <Image
        src="/anynanny-clean-transparent.png.jpg"
        alt="AnyNanny"
        width={18}
        height={18}
        className="object-contain"
      />
      <CreditCard className="absolute bottom-0.5 left-0.5 h-2.5 w-2.5 text-white/80" />
    </div>
  );
}

export default function ParentWalletClient() {
  const { user, isLoading: authLoading } = useAuth();
  const supabase = getSupabaseBrowserClient();

  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<ParentPaymentMethod[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [methodsMenuOpen, setMethodsMenuOpen] = useState(false);

  const fetchPaymentMethods = useCallback(async () => {
    try {
      const res = await fetch("/api/parent/payment-methods", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store"
      });
      const json = (await res.json().catch(() => ({}))) as {
        methods?: ParentPaymentMethod[];
        error?: string;
        missingSchema?: boolean;
      };
      if (!res.ok || json.missingSchema) {
        setPaymentMethods([]);
        return;
      }
      setPaymentMethods(Array.isArray(json.methods) ? json.methods : []);
    } catch (err) {
      console.warn("[parent-wallet] payment methods:", err);
      setPaymentMethods([]);
    }
  }, []);

  const fetchWalletData = useCallback(async () => {
    if (!supabase || !user?.id) return;
    setLoadingData(true);

    try {
      const view = await fetchParentWalletView(supabase, user.id);
      setBalance(view.balance);
      setTransactions(view.transactions);
    } catch (err) {
      console.warn("[parent-wallet] failed to load wallet view:", err);
      setBalance(0);
      setTransactions([]);
    }

    await fetchPaymentMethods();
    setLoadingData(false);
  }, [supabase, user?.id, fetchPaymentMethods]);

  useEffect(() => {
    if (!authLoading && user?.id) {
      void fetchWalletData();
    } else if (!authLoading && !user?.id) {
      setLoadingData(false);
    }
  }, [authLoading, user?.id, fetchWalletData]);

  // After Hyp card-registration redirect: persist token via getToken.
  useEffect(() => {
    if (typeof window === "undefined" || !user?.id) return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const pm = params.get("pm");
    const hypId = params.get("Id") || params.get("id");
    if (status !== "success" || !hypId) return;

    let cancelled = false;
    void (async () => {
      try {
        if (pm === "1" || String(params.get("Info") ?? "").toLowerCase().includes("walletpaymentmethod")) {
          setActionLoading("payment");
          await fetch("/api/parent/payment-methods/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ search: params.toString() })
          });
        }
      } catch (error) {
        console.warn("[parent-wallet] complete payment method:", error);
      } finally {
        if (!cancelled) {
          setActionLoading(null);
          const url = new URL(window.location.href);
          ["status", "pm", "Id", "id", "CCode", "Amount", "Info", "Sign", "Order", "ACode", "UserId"].forEach(
            (key) => url.searchParams.delete(key)
          );
          window.history.replaceState({}, "", url.pathname + url.search);
          void fetchWalletData();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, fetchWalletData]);

  const postIsraelDeposit = async (
    amount: number,
    parentName: string,
    purpose: "deposit" | "payment_method" = "deposit",
    paymentMethod: PaymentOptionId = "credit_card"
  ) => {
    const res = await fetch("/api/billing/israel-deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        parentId: user?.id,
        parentName,
        purpose,
        paymentMethod
      })
    });

    let data: { url?: string; error?: string } = {};
    try {
      data = (await res.json()) as { url?: string; error?: string };
    } catch {
      throw new Error(
        res.status === 404
          ? "נתיב ההפקדה לא נמצא בשרת (404)."
          : `תגובת שרת לא תקינה (HTTP ${res.status}).`
      );
    }

    if (!res.ok || !data.url) {
      throw new Error(data.error || `שגיאה בפתיחת תשלום (HTTP ${res.status}).`);
    }

    window.location.href = data.url;
  };

  const handleUpdatePaymentMethod = async (method: PaymentOptionId) => {
    if (!user?.id) return alert("אנא המתן לטעינת נתוני המשתמש");
    try {
      setActionLoading(`update-${method}`);
      await postIsraelDeposit(
        0,
        `${user.user_metadata?.first_name ?? ""} ${user.user_metadata?.last_name ?? ""}`.trim() ||
          "משתמש AnyNanny",
        "payment_method",
        method
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "חיבור הרשת נכשל");
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    if (!methodsMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && actionLoading === null) setMethodsMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [methodsMenuOpen, actionLoading]);

  const isPageLoading = authLoading || loadingData;
  const defaultCard = paymentMethods.find((m) => m.is_default) ?? paymentMethods[0] ?? null;

  const optionStatus = (id: PaymentOptionId, hint: string): string => {
    if (id === "credit_card") {
      if (isPageLoading) return "טוען…";
      if (defaultCard) return `${defaultCard.brandLabel} •••• ${defaultCard.last4}`;
      return hint;
    }
    return hint;
  };

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-md space-y-5" dir="rtl">
        <div className="w-full flex justify-between items-center px-1 pt-2">
          <button
            type="button"
            onClick={() => void fetchWalletData()}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            title="רענן"
            disabled={isPageLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isPageLoading ? "animate-spin" : ""}`} />
          </button>

          <Link
            href="/parent/dashboard"
            className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 transition-colors font-medium"
          >
            <span>חזרה לדשבורד</span>
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </div>

        <section className="rounded-3xl bg-[#001F3F] p-6 text-white shadow-soft relative overflow-hidden">
          <p className="text-xs font-medium text-white/70">היתרה שלך באפליקציה</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-4xl font-extrabold tracking-tight tabular-nums">
              ₪{isPageLoading ? "0.00" : balance.toFixed(2)}
            </span>
          </div>
          <p className="mt-3 text-[11px] text-white/60 leading-relaxed">
            היתרה מתעדכנת אוטומטית לאחר סיום משמרות ותשמש לכיסוי שירותי השמרטפות הבאים שלך.
          </p>
        </section>

        <section>
          <button
            type="button"
            disabled={isPageLoading}
            onClick={() => setMethodsMenuOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FF8A8A] px-4 py-3.5 text-xs font-bold text-white shadow-soft transition hover:brightness-105 active:scale-[0.99] disabled:opacity-60"
          >
            <CreditCard className="h-4 w-4" />
            אמצעי תשלום שלי
          </button>
        </section>

        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
          <h2 className="text-sm font-bold text-navy-header">פעולות אחרונות</h2>

          <div className="mt-3 space-y-2">
            {isPageLoading ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-navy-header" />
                <p className="text-xs">שולפים תנועות ארנק...</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="rounded-xl bg-slate-50/60 p-4 text-center border border-slate-100">
                <p className="text-xs font-bold text-navy-header">אין פעולות להצגה עדיין</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  כאשר תבצעי תשלום, התנועות יופיעו כאן.
                </p>
              </div>
            ) : (
              transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 p-3 bg-[#FDFBF6]/20"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        tx.type === "deposit" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                      }`}
                    >
                      {tx.type === "deposit" ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 text-right">
                      <p className="truncate text-xs font-bold text-slate-800">{tx.description}</p>
                      <p className="text-[10px] text-slate-400 tabular-nums">
                        {new Date(tx.created_at).toLocaleDateString("he-IL")}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-bold tabular-nums ${
                      tx.type === "deposit" ? "text-emerald-600" : "text-slate-700"
                    }`}
                  >
                    {tx.type === "deposit" ? "+" : "-"}₪{tx.amount.toFixed(2)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {methodsMenuOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/45 p-3 sm:items-center"
          dir="rtl"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="סגור"
            onClick={() => {
              if (actionLoading === null) setMethodsMenuOpen(false);
            }}
          />
          <div className="relative z-[1] w-full max-w-md overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setMethodsMenuOpen(false)}
                disabled={actionLoading !== null}
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                aria-label="סגור"
              >
                <X className="h-4 w-4" />
              </button>
              <h3 className="text-sm font-bold text-navy-header">אמצעי תשלום שלי</h3>
              <span className="w-8" />
            </div>

            <div className="space-y-2 px-3 py-3">
              {PAYMENT_OPTIONS.map((option) => {
                const updating = actionLoading === `update-${option.id}`;
                return (
                  <div
                    key={option.id}
                    className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 ${option.accentClass}`}
                  >
                    <PaymentOptionLogo id={option.id} />
                    <div className="min-w-0 flex-1 text-right">
                      <p className="text-xs font-bold text-slate-800">{option.label}</p>
                      <p className="truncate text-[10px] text-slate-500" dir="ltr">
                        {optionStatus(option.id, option.hint)}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={actionLoading !== null}
                      onClick={() => void handleUpdatePaymentMethod(option.id)}
                      className="shrink-0 text-[11px] font-bold text-[#0B3C5D] underline underline-offset-2 decoration-[#0B3C5D]/50 transition hover:text-[#FF8A8A] hover:decoration-[#FF8A8A] disabled:opacity-50"
                    >
                      {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "עדכן"}
                    </button>
                  </div>
                );
              })}
            </div>

            <p className="border-t border-slate-100 px-4 py-3 text-center text-[11px] text-slate-500">
              עדכון מפנה לעמוד HYP המאובטח לניהול אמצעי התשלום.
            </p>
          </div>
        </div>
      ) : null}
    </MainLayout>
  );
}
