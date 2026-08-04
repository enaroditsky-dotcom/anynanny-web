"use client";

import { useEffect, useState, useCallback } from "react";
import { ArrowUpRight, ArrowDownLeft, Loader2, RefreshCw, ArrowLeft } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { SitterPayoutWalletCards } from "@/components/sitter/SitterPayoutWalletCards";
import { ActionToast } from "@/components/ui/action-toast";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  fetchSitterWalletView,
  type SitterWalletTransaction
} from "@/lib/wallet/sitter-wallet";
import Link from "next/link";

export default function SitterWalletPage() {
  const { user, isLoading: authLoading } = useAuth();
  const supabase = getSupabaseBrowserClient();

  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<SitterWalletTransaction[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [payoutReloadToken, setPayoutReloadToken] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const fetchWalletData = useCallback(async () => {
    if (!supabase || !user?.id) return;
    setLoadingData(true);
    try {
      const result = await fetchSitterWalletView(supabase, user.id);
      setBalance(Number.isFinite(result.balance) ? result.balance : 0);
      setTransactions(Array.isArray(result.transactions) ? result.transactions : []);
    } catch (err) {
      console.warn("[sitter-wallet] failed to load wallet view:", err);
      setBalance(0);
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

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <div className="mx-auto w-full max-w-md space-y-5 px-4 pt-4" dir="rtl">
        <div className="flex w-full items-center justify-between px-1">
          <button
            type="button"
            onClick={() => void fetchWalletData()}
            className="text-slate-400 transition-colors hover:text-slate-600"
            title="רענן"
            disabled={isPageLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isPageLoading ? "animate-spin" : ""}`} />
          </button>

          <Link
            href="/sitter/dashboard"
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-800"
          >
            <span>חזרה לדשבורד</span>
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
        </div>

        <header className="px-1 text-right">
          <h1 className="text-lg font-extrabold text-navy-header">הארנק שלי</h1>
          <p className="mt-0.5 text-[11px] text-slate-500">עיבוד מאובטח דרך שער התשלומים HYP</p>
        </header>

        <section className="relative overflow-hidden rounded-3xl bg-[#0B3C5D] p-6 text-white shadow-soft">
          <p className="text-xs font-medium text-white/70">היתרה שלך הזמינה למשיכה</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-4xl font-extrabold tracking-tight tabular-nums">
              ₪{isPageLoading ? "0.00" : balance.toFixed(2)}
            </span>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-white/60">
            הרווחים מתווספים אוטומטית לאחר אישור תשלום מאובטח ב־HYP. יתרה זמינה כוללת רק עסקאות שאושרו.
          </p>
        </section>

        {user?.id ? (
          <SitterPayoutWalletCards sitterId={user.id} reloadToken={payoutReloadToken} />
        ) : null}

        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
          <h2 className="text-sm font-bold text-navy-header">הכנסות ותשלומים</h2>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
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
                <p className="mt-1 text-[11px] text-slate-500">
                  הרווחים ממשמרות שהושלמו ומשיכות כספים יופיעו כאן.
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
                      <p className="text-[10px] tabular-nums text-slate-400">
                        {new Date(tx.created_at).toLocaleDateString("he-IL")}
                        {tx.status === "pending" ? " · ממתין לאישור תשלום" : ""}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-bold tabular-nums ${
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
        </section>
      </div>
      <ActionToast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
