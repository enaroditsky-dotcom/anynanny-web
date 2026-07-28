"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CreditCard,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Loader2,
  RefreshCw,
  ArrowLeft
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { MainLayout } from "@/components/layout/MainLayout";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  fetchParentBillingTransactions,
  type BillingTransaction
} from "@/lib/wallet/billing-transactions";

export default function ParentWalletClient() {
  const { user, isLoading: authLoading } = useAuth();
  const supabase = getSupabaseBrowserClient();

  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchWalletData = useCallback(async () => {
    if (!supabase || !user?.id) return;
    setLoadingData(true);

    try {
      const { data: wallet, error: walletError } = await supabase
        .from("parent_wallet_balances")
        .select("balance")
        .eq("parent_id", user.id)
        .maybeSingle();

      if (!walletError && wallet) {
        setBalance(Number(wallet.balance) || 0);
      } else {
        setBalance(0);
      }
    } catch {
      console.warn("Table parent_wallet_balances might be missing, using default 0.");
      setBalance(0);
    }

    try {
      const txData = await fetchParentBillingTransactions(supabase, user.id);
      setTransactions(txData);
    } catch (err) {
      console.warn("Table billing_transactions might be missing, using empty array.", err);
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

  const postIsraelDeposit = async (amount: number, parentName: string) => {
    const res = await fetch("/api/billing/israel-deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        parentId: user?.id,
        parentName
      })
    });

    let data: { url?: string; error?: string } = {};
    try {
      data = (await res.json()) as { url?: string; error?: string };
    } catch {
      throw new Error(
        res.status === 404
          ? "\u05e0\u05ea\u05d9\u05d1 \u05d4\u05d4\u05e4\u05e7\u05d3\u05d4 \u05dc\u05d0 \u05e0\u05de\u05e6\u05d0 \u05d1\u05e9\u05e8\u05ea (404)."
          : `\u05ea\u05d2\u05d5\u05d1\u05ea \u05e9\u05e8\u05ea \u05dc\u05d0 \u05ea\u05e7\u05d9\u05e0\u05d4 (HTTP ${res.status}).`
      );
    }

    if (!res.ok || !data.url) {
      throw new Error(data.error || `\u05e9\u05d2\u05d9\u05d0\u05d4 \u05d1\u05e4\u05ea\u05d9\u05d7\u05ea \u05ea\u05e9\u05dc\u05d5\u05dd (HTTP ${res.status}).`);
    }

    window.location.href = data.url;
  };

  const handleManagePaymentMethods = async () => {
    if (!user?.id) return alert("\u05d0\u05e0\u05d0 \u05d4\u05de\u05ea\u05df \u05dc\u05d8\u05e2\u05d9\u05e0\u05ea \u05e0\u05ea\u05d5\u05e0\u05d9 \u05d4\u05de\u05e9\u05ea\u05de\u05e9");
    try {
      setActionLoading("payment");
      await postIsraelDeposit(
        0,
        `${user.user_metadata?.first_name ?? ""} ${user.user_metadata?.last_name ?? ""}`.trim() ||
          "\u05de\u05e9\u05ea\u05de\u05e9 AnyNanny"
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "\u05d7\u05d9\u05d1\u05d5\u05e8 \u05d4\u05e8\u05e9\u05ea \u05e0\u05db\u05e9\u05dc");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeposit = async () => {
    if (!user?.id) return alert("\u05d0\u05e0\u05d0 \u05d4\u05de\u05ea\u05df \u05dc\u05d8\u05e2\u05d9\u05e0\u05ea \u05e0\u05ea\u05d5\u05e0\u05d9 \u05d4\u05de\u05e9\u05ea\u05de\u05e9");
    try {
      setActionLoading("deposit");
      await postIsraelDeposit(
        100,
        `${user.user_metadata?.first_name ?? ""} ${user.user_metadata?.last_name ?? ""}`.trim() ||
          "\u05d4\u05d5\u05e8\u05d4 AnyNanny"
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "\u05d7\u05d9\u05d1\u05d5\u05e8 \u05d4\u05e8\u05e9\u05ea \u05e0\u05db\u05e9\u05dc");
    } finally {
      setActionLoading(null);
    }
  };

  const isPageLoading = authLoading || loadingData;

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-md space-y-5" dir="rtl">
        <div className="w-full flex justify-between items-center px-1 pt-2">
          <button
            type="button"
            onClick={() => void fetchWalletData()}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            title="\u05e8\u05e2\u05e0\u05df"
            disabled={isPageLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isPageLoading ? "animate-spin" : ""}`} />
          </button>

          <Link
            href="/parent/dashboard"
            className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 transition-colors font-medium"
          >
            <span>{"\u05d7\u05d6\u05e8\u05d4 \u05dc\u05d3\u05e9\u05d1\u05d5\u05e8\u05d3"}</span>
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </div>

        <section className="rounded-3xl bg-[#001F3F] p-6 text-white shadow-soft relative overflow-hidden">
          <p className="text-xs font-medium text-white/70">{"\u05d4\u05d9\u05ea\u05e8\u05d4 \u05e9\u05dc\u05da \u05d1\u05d0\u05e4\u05dc\u05d9\u05e7\u05e6\u05d9\u05d4"}</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-4xl font-extrabold tracking-tight tabular-nums">
              {"\u20aa"}{isPageLoading ? "0.00" : balance.toFixed(2)}
            </span>
          </div>
          <p className="mt-3 text-[11px] text-white/60 leading-relaxed">
            {"\u05d4\u05d9\u05ea\u05e8\u05d4 \u05de\u05ea\u05e2\u05d3\u05db\u05e0\u05ea \u05d0\u05d5\u05d8\u05d5\u05de\u05d8\u05d9\u05ea \u05dc\u05d0\u05d7\u05e8 \u05e1\u05d9\u05d5\u05dd \u05de\u05e9\u05de\u05e8\u05d5\u05ea \u05d5\u05ea\u05e9\u05de\u05e9 \u05dc\u05db\u05d9\u05e1\u05d5\u05d9 \u05e9\u05d9\u05e8\u05d5\u05ea\u05d9 \u05d4\u05e9\u05de\u05e8\u05d8\u05e4\u05d5\u05ea \u05d4\u05d1\u05d0\u05d9\u05dd \u05e9\u05dc\u05da."}
          </p>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={isPageLoading || actionLoading !== null}
            onClick={() => void handleDeposit()}
            className="flex items-center justify-center gap-2 rounded-2xl bg-[#FF8A8A] px-4 py-3.5 text-xs font-bold text-white shadow-soft transition hover:brightness-105 active:scale-[0.99] disabled:opacity-60"
          >
            {actionLoading === "deposit" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {"\u05d4\u05d8\u05e2\u05df \u05db\u05e1\u05e3 \u05dc\u05d0\u05e8\u05e0\u05e7"}
          </button>

          <button
            type="button"
            disabled={isPageLoading || actionLoading !== null}
            onClick={() => void handleManagePaymentMethods()}
            className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-xs font-bold text-navy-header shadow-sm transition hover:bg-[#FDFBF6]/60 active:scale-[0.99] disabled:opacity-60"
          >
            {actionLoading === "payment" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            {"\u05d0\u05de\u05e6\u05e2\u05d9 \u05ea\u05e9\u05dc\u05d5\u05dd"}
          </button>
        </section>

        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
          <h2 className="text-sm font-bold text-navy-header">{"\u05e4\u05e2\u05d5\u05dc\u05d5\u05ea \u05d0\u05d7\u05e8\u05d5\u05e0\u05d5\u05ea"}</h2>

          <div className="mt-3 space-y-2">
            {isPageLoading ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-navy-header" />
                <p className="text-xs">{"\u05e9\u05d5\u05dc\u05e4\u05d9\u05dd \u05ea\u05e0\u05d5\u05e2\u05d5\u05ea \u05d0\u05e8\u05e0\u05e7..."}</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="rounded-xl bg-slate-50/60 p-4 text-center border border-slate-100">
                <p className="text-xs font-bold text-navy-header">{"\u05d0\u05d9\u05df \u05e4\u05e2\u05d5\u05dc\u05d5\u05ea \u05dc\u05d4\u05e6\u05d2\u05d4 \u05e2\u05d3\u05d9\u05d9\u05df"}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {"\u05db\u05d0\u05e9\u05e8 \u05ea\u05d1\u05e6\u05e2\u05d9 \u05ea\u05e9\u05dc\u05d5\u05dd \u05d0\u05d5 \u05d8\u05e2\u05d9\u05e0\u05d4, \u05d4\u05ea\u05e0\u05d5\u05e2\u05d5\u05ea \u05d9\u05d5\u05e4\u05d9\u05e2\u05d5 \u05db\u05d0\u05df."}
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
                    {tx.type === "deposit" ? "+" : "-"}{"\u20aa"}{tx.amount.toFixed(2)}
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
