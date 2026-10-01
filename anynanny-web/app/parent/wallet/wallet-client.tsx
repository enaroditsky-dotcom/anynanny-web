"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { ArrowUpRight, ArrowDownLeft, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageBackLink } from "@/components/navigation/page-back-link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchParentWalletView } from "@/lib/wallet/parent-wallet";
import type { BillingTransaction } from "@/lib/wallet/billing-transactions";

/** Visible history rows before the list scrolls internally. */
const WALLET_HISTORY_VISIBLE_ROWS = 6;
/**
 * Measured row box is 4rem: p-3 plus two text lines, which are taller than the h-8 icon.
 * space-y-2 adds 0.5rem between rows.
 * 6 rows = 6 * 4rem + 5 * 0.5rem = 26.5rem (424px).
 * Shorter lists stay at their natural height. The page itself scrolls.
 */
const WALLET_HISTORY_LIST_MAX_CLASS =
  "max-h-[26.5rem] min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] [scrollbar-color:rgb(148_163_184/0.45)_transparent] [scrollbar-width:thin]";

/**
 * The wallet column scrolls with the app shell at every viewport.
 * Shell bottom padding clears the fixed nav. History rows scroll inside the card
 * once the list exceeds the cap above. The payment accordion stays in normal flow.
 */
const WALLET_PAYMENT_INFO_COPY =
  "זמין ובטוח: שלמו לבייביסיטר לפי אמצעי התשלום שהיא בחרה — Bit, PayBox או מזומן.";

const CHECKOUT_RETURN_PARAMS = [
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
] as const;

export default function ParentWalletClient() {
  const { user, isLoading: authLoading } = useAuth();
  const supabase = getSupabaseBrowserClient();

  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [paymentAppsOpen, setPaymentAppsOpen] = useState(false);

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

    setLoadingData(false);
  }, [supabase, user?.id]);

  useEffect(() => {
    if (!authLoading && user?.id) {
      void fetchWalletData();
    } else if (!authLoading && !user?.id) {
      setLoadingData(false);
    }
  }, [authLoading, user?.id, fetchWalletData]);

  // Drop hosted-checkout return params. Do not save a card or complete a charge.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of CHECKOUT_RETURN_PARAMS) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (!changed) return;
    const next = url.pathname + url.search + url.hash;
    window.history.replaceState({}, "", next);
  }, []);

  const isPageLoading = authLoading || loadingData;

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

  return (
    <MainLayout showBrandHeader={false}>
      <div className="mx-auto w-full min-w-0 max-w-md space-y-5" dir="rtl">
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
            הסכום והתאריך של התשלום האחרון שנרשם בארנק.
          </p>
        </section>

        <section className="min-w-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
          <h2 className="m-0">
            <button
              type="button"
              aria-expanded={paymentAppsOpen}
              aria-controls="parent-wallet-payment-apps"
              onClick={() => setPaymentAppsOpen((open) => !open)}
              className="flex w-full min-w-0 items-center justify-between gap-3 text-right"
            >
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-base font-extrabold text-navy-header">אמצעי תשלום שימושיים</span>
                <span className="inline-flex items-center gap-2">
                  <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg">
                    <Image
                      src="/wallet/bit-logo.png"
                      alt="Bit"
                      width={272}
                      height={205}
                      className="absolute max-w-none"
                      style={{
                        width: "54.04px",
                        height: "auto",
                        left: "-9.94px",
                        top: "-4.17px"
                      }}
                    />
                  </span>
                  <span className="inline-flex h-8 w-8 shrink-0 overflow-hidden rounded-lg">
                    <Image
                      src="/wallet/paybox-logo.png"
                      alt="PayBox"
                      width={32}
                      height={32}
                      className="h-8 w-8 object-cover"
                    />
                  </span>
                  <span
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-[32px] font-extrabold leading-none text-navy-header"
                    aria-label="מזומן"
                  >
                    ₪
                  </span>
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                  paymentAppsOpen ? "rotate-180" : ""
                }`}
                aria-hidden
              />
            </button>
          </h2>

          {paymentAppsOpen ? (
            <p id="parent-wallet-payment-apps" className="mt-4 break-words text-[16px] font-semibold leading-relaxed text-slate-800 md:text-[17px]">
              {WALLET_PAYMENT_INFO_COPY}
            </p>
          ) : null}
        </section>

        <section className="min-w-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
          <h2 className="text-sm font-bold text-navy-header">פירוט תשלומים</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
            היסטוריית התנועות שנרשמו בארנק.
          </p>

          <div className={`mt-3 min-w-0 space-y-2 ${WALLET_HISTORY_LIST_MAX_CLASS}`}>
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
                  className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-100 p-3 bg-[#FDFBF6]/20"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
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
                    className={`shrink-0 text-xs font-bold tabular-nums ${
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
    </MainLayout>
  );
}
