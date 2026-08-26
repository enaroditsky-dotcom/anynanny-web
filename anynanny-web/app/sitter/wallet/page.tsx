"use client";

import { useEffect, useState, useCallback } from "react";
import { ArrowUpRight, ArrowDownLeft, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { PageBackLink } from "@/components/navigation/page-back-link";
import { SitterPayoutWalletCards } from "@/components/sitter/SitterPayoutWalletCards";
import { ActionToast } from "@/components/ui/action-toast";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  EMPTY_SITTER_EARNINGS_SUMMARY,
  fetchSitterWalletView,
  type SitterEarningsSummary,
  type SitterWalletTransaction
} from "@/lib/wallet/sitter-wallet";

function formatNis(amount: number): string {
  return `₪${amount.toFixed(2)}`;
}

export default function SitterWalletPage() {
  const { user, isLoading: authLoading } = useAuth();
  const supabase = getSupabaseBrowserClient();

  const [earnings, setEarnings] = useState<SitterEarningsSummary>(EMPTY_SITTER_EARNINGS_SUMMARY);
  const [transactions, setTransactions] = useState<SitterWalletTransaction[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [payoutReloadToken, setPayoutReloadToken] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const fetchWalletData = useCallback(async () => {
    if (!supabase || !user?.id) return;
    setLoadingData(true);
    try {
      const result = await fetchSitterWalletView(supabase, user.id);
      setEarnings(result.earningsSummary ?? EMPTY_SITTER_EARNINGS_SUMMARY);
      setTransactions(Array.isArray(result.transactions) ? result.transactions : []);
    } catch (err) {
      console.warn("[sitter-wallet] failed to load wallet view:", err);
      setEarnings(EMPTY_SITTER_EARNINGS_SUMMARY);
      setTransactions([]);
    } finally {
      setLoadingData(false);
    }
  }, [user?.id, supabase]);

  useEffect(() => {
    if (!authLoading && user?.id) {
      void fetchWalletData();
    } else if (!authLoading && !user?.id) {
      setLoadingData(false);
    }
  }, [authLoading, user?.id, fetchWalletData]);

  // After Hyp card-registration redirect: persist payout token via getToken.
  useEffect(() => {
    if (typeof window === "undefined" || !user?.id) return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const pm = params.get("pm");
    const hypId = params.get("Id") || params.get("id");
    const info = String(params.get("Info") ?? "");
    if (status !== "success" || !hypId) return;
    if (pm !== "1" && !/sitterpayoutmethod/i.test(info)) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/sitter/payout-methods/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ search: params.toString() })
        });
        if (!cancelled) {
          if (res.ok) setToast("כרטיס המשיכה נרשם בהצלחה ב־HYP");
          else setToast("רישום HYP לא הושלם — נסו שוב מאמצעי התשלום");
        }
      } catch (error) {
        console.warn("[sitter-wallet] complete payout method:", error);
        if (!cancelled) setToast("רישום HYP לא הושלם — נסו שוב מאמצעי התשלום");
      } finally {
        if (!cancelled) {
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
          setPayoutReloadToken((n) => n + 1);
          void fetchWalletData();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, fetchWalletData]);

  const isPageLoading = authLoading || loadingData;
  const monthEarnings = isPageLoading ? 0 : earnings.monthEarnings;
  const yearEarnings = isPageLoading ? 0 : earnings.yearEarnings;
  const monthShiftCount = isPageLoading ? 0 : earnings.monthShiftCount;

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <div className="mx-auto w-full max-w-md space-y-5 px-4 pt-4" dir="rtl">
        <div className="flex w-full items-center justify-between gap-3 px-1" dir="ltr">
          <PageBackLink href="/sitter/dashboard" />
          <button
            type="button"
            onClick={() => void fetchWalletData()}
            className="text-slate-400 transition-colors hover:text-slate-600"
            title="רענן"
            disabled={isPageLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isPageLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <header className="px-1 text-right">
          <h1 className="text-lg font-extrabold text-navy-header">הארנק שלי</h1>
          <p className="mt-0.5 text-[13px] text-slate-500">עיבוד מאובטח דרך שער התשלומים HYP</p>
        </header>

        <section className="relative overflow-hidden rounded-3xl bg-[#0B3C5D] p-6 text-white shadow-soft">
          <p className="text-xs font-medium text-white/70">הכנסות החודש</p>
          <p className="mt-2 min-w-0 truncate text-4xl font-extrabold tracking-tight tabular-nums">
            {formatNis(monthEarnings)}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/15 pt-4">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-white/70">סה״כ מתחילת השנה</p>
              <p className="mt-1 truncate text-lg font-bold tabular-nums">{formatNis(yearEarnings)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-white/70">משמרות החודש</p>
              <p className="mt-1 text-lg font-bold tabular-nums">{monthShiftCount}</p>
            </div>
          </div>
        </section>

        {user?.id ? (
          <SitterPayoutWalletCards sitterId={user.id} reloadToken={payoutReloadToken} />
        ) : null}

        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
          <button
            type="button"
            onClick={() => setHistoryOpen((open) => !open)}
            aria-expanded={historyOpen}
            aria-controls="sitter-earnings-history"
            className="flex w-full items-center justify-between gap-3 text-right"
          >
            <h2 className="text-sm font-bold text-navy-header">הכנסות ותשלומים</h2>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                historyOpen ? "rotate-180" : ""
              }`}
              aria-hidden
            />
          </button>

          <div
            id="sitter-earnings-history"
            className={`grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out ${
              historyOpen ? "mt-3 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <p className="text-[12px] leading-relaxed text-slate-500">
                הכספים מעובדים באופן מאובטח דרך שער התשלומים המורשה HYP.
              </p>

              <div className="mt-3 space-y-2">
                {isPageLoading ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin text-navy-header" />
                    <p className="text-xs">שולפים תנועות ארנק...</p>
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-center">
                    <p className="text-xs font-bold text-navy-header">אין פעולות להצגה עדיין</p>
                    <p className="mt-1 text-[13px] text-slate-500">
                      הרווחים ממשמרות שהושלמו יופיעו כאן.
                    </p>
                  </div>
                ) : (
                  transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between rounded-xl border border-slate-100 bg-[#FDFBF6]/20 p-3"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            tx.type === "earnings" || tx.type === "bonus"
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-rose-50 text-rose-600"
                          }`}
                        >
                          {tx.type === "earnings" || tx.type === "bonus" ? (
                            <ArrowDownLeft className="h-4 w-4" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0 text-right">
                          <p className="truncate text-xs font-bold text-slate-800">{tx.description}</p>
                          <p className="text-[12px] tabular-nums text-slate-400">
                            {new Date(tx.created_at).toLocaleDateString("he-IL")}
                            {tx.status === "pending" ? " · ממתין לאישור תשלום" : ""}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`ms-2 shrink-0 text-xs font-bold tabular-nums ${
                          tx.type === "earnings" || tx.type === "bonus"
                            ? "text-emerald-600"
                            : "text-slate-700"
                        }`}
                      >
                        {tx.type === "earnings" || tx.type === "bonus" ? "+" : "-"}₪
                        {Number(tx.amount).toFixed(2)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
      <ActionToast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
