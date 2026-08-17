"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  Loader2,
  RefreshCw,
  ChevronLeft,
  CheckCircle2,
  X
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageBackLink } from "@/components/navigation/page-back-link";
import { ActionToast } from "@/components/ui/action-toast";
import {
  EMPTY_METHOD_HINT,
  WalletMethodCardRow,
  WalletMethodVisualCard
} from "@/components/wallet/wallet-method-brand";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchParentWalletView } from "@/lib/wallet/parent-wallet";
import type { BillingTransaction } from "@/lib/wallet/billing-transactions";
import type { ParentPaymentMethod } from "@/lib/wallet/parent-payment-methods";
import {
  readParentPreferredCheckoutMethod,
  writeParentPreferredCheckoutMethod,
  type ParentPreferredCheckoutMethod
} from "@/lib/wallet/parent-preferred-checkout-method";

type PaymentOptionId =
  | "credit_card"
  | "bit"
  | "apple_pay"
  | "google_pay";

const PAYMENT_OPTIONS: Array<{
  id: PaymentOptionId;
  label: string;
}> = [
  { id: "credit_card", label: "כרטיס אשראי" },
  { id: "bit", label: "Bit" },
  { id: "apple_pay", label: "Apple Pay" },
  { id: "google_pay", label: "Google Pay" }
];

function walletRailExplanation(id: PaymentOptionId): string {
  if (id === "bit") {
    return "Bit ישמש כאמצעי המועדף בתשלום משמרת. לא נפתח שער תשלום עכשיו — החיוב ב־HYP יתבצע רק כשתאשרו תשלום בפועל בדשבורד.";
  }
  if (id === "apple_pay") {
    return "Apple Pay ישמש כאמצעי המועדף בתשלום משמרת. תשלום מאובטח ב־HYP יתבצע רק בגרסה הבאה.";
  }
  if (id === "google_pay") {
    return "Google Pay ישמש כאמצעי המועדף בתשלום משמרת. תשלום מאובטח ב־HYP יתבצע רק בגרסה הבאה.";
  }
  return "שמירת כרטיס מאפשרת חיוב מהיר במשמרות הבאות דרך HYP.";
}

export default function ParentWalletClient() {
  const { user, isLoading: authLoading } = useAuth();
  const supabase = getSupabaseBrowserClient();

  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<ParentPaymentMethod[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [methodsMenuOpen, setMethodsMenuOpen] = useState(false);
  const [viewingMethod, setViewingMethod] = useState<PaymentOptionId | null>(null);
  const [preferredMethod, setPreferredMethod] = useState<ParentPreferredCheckoutMethod | null>(
    null
  );
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setPreferredMethod(null);
      return;
    }
    setPreferredMethod(readParentPreferredCheckoutMethod(user.id));
  }, [user?.id]);

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
      setTransactions(view.transactions);
    } catch (err) {
      console.warn("[parent-wallet] failed to load wallet view:", err);
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
        if (
          pm === "1" ||
          String(params.get("Info") ?? "")
            .toLowerCase()
            .includes("walletpaymentmethod")
        ) {
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
          [
            "status",
            "pm",
            "Id",
            "id",
            "CCode",
            "Amount",
            "Info",
            "Sign",
            "Order",
            "ACode",
            "UserId"
          ].forEach((key) => url.searchParams.delete(key));
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

  /** Card only — Bit/PayBox must not open a ₪1 HYP registration from this modal. */
  const handleRegisterCreditCard = async () => {
    if (!user?.id) return alert("אנא המתן לטעינת נתוני המשתמש");
    try {
      setActionLoading("update-credit_card");
      await postIsraelDeposit(
        0,
        `${user.user_metadata?.first_name ?? ""} ${user.user_metadata?.last_name ?? ""}`.trim() ||
          "משתמש AnyNanny",
        "payment_method",
        "credit_card"
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "חיבור הרשת נכשל");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSelectPreferred = (method: PaymentOptionId) => {
    if (!user?.id) return;
    writeParentPreferredCheckoutMethod(user.id, method);
    setPreferredMethod(method);
    setToast(
      method === "bit"
        ? "Bit הוגדר כאמצעי המועדף לתשלום משמרת"
        : method === "apple_pay"
          ? "Apple Pay הוגדר כאמצעי המועדף לתשלום משמרת"
          : method === "google_pay"
            ? "Google Pay הוגדר כאמצעי המועדף לתשלום משמרת"
            : "כרטיס אשראי הוגדר כאמצעי המועדף"
    );
  };

  useEffect(() => {
    if (!methodsMenuOpen) {
      setViewingMethod(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || actionLoading !== null) return;
      if (viewingMethod) setViewingMethod(null);
      else setMethodsMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [methodsMenuOpen, actionLoading, viewingMethod]);

  const isPageLoading = authLoading || loadingData;
  const defaultCard = paymentMethods.find((m) => m.is_default) ?? paymentMethods[0] ?? null;

  const lastPayment = (() => {
    const succeeded = transactions.filter(
      (tx) => tx.status === "succeeded" && Number(tx.amount) > 0
    );
    const payments = succeeded.filter((tx) => tx.type === "payment");
    const pool = payments.length > 0 ? payments : succeeded;
    if (pool.length === 0) return null;
    return [...pool].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]!;
  })();

  const lastPaymentDateLabel = lastPayment
    ? new Date(lastPayment.created_at).toLocaleDateString("he-IL", {
        day: "numeric",
        month: "long",
        year: "numeric"
      })
    : null;

  const isConfigured = (id: PaymentOptionId): boolean => {
    if (id === "credit_card") return paymentMethods.length > 0;
    return preferredMethod === id;
  };

  const optionStatus = (id: PaymentOptionId): string => {
    if (id === "credit_card") {
      if (isPageLoading) return "טוען…";
      if (defaultCard) {
        const preferredMark =
          preferredMethod === "credit_card" || preferredMethod == null ? " · מועדף" : "";
        return `${defaultCard.brandLabel} •••• ${defaultCard.last4}${preferredMark}`;
      }
      return EMPTY_METHOD_HINT;
    }
    if (preferredMethod === id) return "מועדף לתשלום משמרת";
    if (id === "bit") return "בחרו להגדיר כמועדף — ללא חיוב עכשיו";
    if (id === "apple_pay" || id === "google_pay") return "בחרו להגדיר כמועדף — ללא חיוב עכשיו";
    return EMPTY_METHOD_HINT;
  };

  const optionLabel = (id: PaymentOptionId) =>
    PAYMENT_OPTIONS.find((o) => o.id === id)?.label ?? id;

  const openMethodDetails = (id: PaymentOptionId) => {
    setViewingMethod(id);
  };

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-md space-y-5" dir="rtl">
        <div className="flex w-full items-center justify-between gap-3 px-1 pt-2" dir="ltr">
          <PageBackLink href="/parent/dashboard" />
          <button
            type="button"
            onClick={() => void fetchWalletData()}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            title="רענן"
            disabled={isPageLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isPageLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <header className="px-1 text-right">
          <h1 className="text-lg font-extrabold text-navy-header">הארנק שלי</h1>
          <p className="mt-0.5 text-[13px] text-slate-500">עיבוד מאובטח דרך שער התשלומים HYP</p>
        </header>

        <section className="rounded-3xl bg-[#001F3F] p-6 text-white shadow-soft relative overflow-hidden">
          <p className="text-xs font-medium text-white/70">תשלום אחרון</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {isPageLoading ? (
              <span className="text-4xl font-extrabold tracking-tight tabular-nums">₪—</span>
            ) : lastPayment ? (
              <>
                <span className="text-4xl font-extrabold tracking-tight tabular-nums">
                  ₪{lastPayment.amount.toFixed(2)}
                </span>
                {lastPaymentDateLabel ? (
                  <span className="text-sm font-semibold text-white/80 tabular-nums">
                    · {lastPaymentDateLabel}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-2xl font-extrabold tracking-tight text-white/85">
                אין תשלום עדיין
              </span>
            )}
          </div>
          <p className="mt-3 text-[13px] text-white/60 leading-relaxed">
            מוצג כאן סכום ותאריך העסקה המאובטחת האחרונה שהושלמה בהצלחה דרך שער התשלומים HYP.
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
          <h2 className="text-sm font-bold text-navy-header">הכנסות ותשלומים</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
            הכספים מעובדים באופן מאובטח דרך שער התשלומים המורשה HYP.
          </p>

          <div className="mt-3 space-y-2">
            {isPageLoading ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-navy-header" />
                <p className="text-xs">שולפים תנועות ארנק...</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="rounded-xl bg-slate-50/60 p-4 text-center border border-slate-100">
                <p className="text-xs font-bold text-navy-header">אין פעולות להצגה עדיין</p>
                <p className="mt-1 text-[13px] text-slate-500">
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
                        tx.type === "deposit"
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-rose-50 text-rose-600"
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
                      <p className="text-[12px] text-slate-400 tabular-nums">
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
              if (actionLoading !== null) return;
              if (viewingMethod) setViewingMethod(null);
              else setMethodsMenuOpen(false);
            }}
          />
          <div className="relative z-[1] w-full max-w-md overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              {viewingMethod ? (
                <button
                  type="button"
                  onClick={() => setViewingMethod(null)}
                  disabled={actionLoading !== null}
                  className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
                  aria-label="חזרה"
                >
                  <ChevronLeft className="h-4 w-4 rotate-180" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setMethodsMenuOpen(false)}
                  disabled={actionLoading !== null}
                  className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                  aria-label="סגור"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <h3 className="text-sm font-bold text-navy-header">
                {viewingMethod ? optionLabel(viewingMethod) : "אמצעי תשלום שלי"}
              </h3>
              <span className="w-8" />
            </div>

            {viewingMethod ? (
              <div className="space-y-3 px-4 py-4">
                <WalletMethodVisualCard
                  kind={viewingMethod}
                  status={optionStatus(viewingMethod)}
                  ready={isConfigured(viewingMethod)}
                  compact={false}
                  cardTitle={optionLabel(viewingMethod)}
                />

                <p className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-right text-[13px] leading-relaxed text-slate-600">
                  {walletRailExplanation(viewingMethod)}
                </p>

                {viewingMethod === "credit_card" ? (
                  <div className="space-y-2">
                    {paymentMethods.map((method) => (
                      <div
                        key={method.id}
                        className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-right"
                      >
                        <p className="text-xs font-bold text-slate-800">
                          {method.brandLabel} •••• {method.last4}
                          {method.is_default ? (
                            <span className="mr-1 text-[12px] font-semibold text-emerald-700">
                              · ברירת מחדל
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-[12px] tabular-nums text-slate-400" dir="ltr">
                          תוקף {String(method.exp_month).padStart(2, "0")}/
                          {String(method.exp_year).slice(-2)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {preferredMethod === viewingMethod ? (
                  <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" /> אמצעי מועדף לתשלום משמרת
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSelectPreferred(viewingMethod)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0B3C5D] px-4 py-3 text-sm font-bold text-white transition hover:brightness-110"
                  >
                    הגדר כמועדף
                  </button>
                )}

                {viewingMethod === "credit_card" ? (
                  <button
                    type="button"
                    disabled={actionLoading !== null}
                    onClick={() => void handleRegisterCreditCard()}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    {actionLoading === "update-credit_card" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {paymentMethods.length > 0 ? "עדכון / הוספת כרטיס ב־HYP" : "הוספת כרטיס ב־HYP"}
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                <div className="space-y-3 px-3 py-3">
                  {PAYMENT_OPTIONS.map((option) => {
                    const updating =
                      option.id === "credit_card" && actionLoading === "update-credit_card";
                    const ready = isConfigured(option.id);
                    return (
                      <WalletMethodCardRow
                        key={option.id}
                        kind={option.id}
                        status={optionStatus(option.id)}
                        ready={ready}
                        updating={updating}
                        updateDisabled={actionLoading !== null}
                        cardTitle={option.label}
                        updateLabel={option.id === "credit_card" ? "עדכון" : "בחירה"}
                        onOpen={() => openMethodDetails(option.id)}
                        onUpdate={() => {
                          if (option.id === "credit_card") {
                            if (ready) openMethodDetails(option.id);
                            else void handleRegisterCreditCard();
                            return;
                          }
                          openMethodDetails(option.id);
                        }}
                      />
                    );
                  })}
                </div>
                <p className="border-t border-slate-100 px-4 py-3 text-center text-[13px] text-slate-500">
                  Bit, Apple Pay ו־Google Pay נבחרים כאן כמועדפים בלבד. החיוב ב־HYP מתבצע רק בתשלום משמרת.
                </p>
              </>
            )}
          </div>
        </div>
      ) : null}

      <ActionToast message={toast} onDismiss={() => setToast(null)} />
    </MainLayout>
  );
}
