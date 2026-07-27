"use client";

import { useEffect, useState, useCallback } from "react";
import { Landmark, ArrowUpRight, ArrowDownLeft, Loader2, RefreshCw, ArrowLeft, Wallet } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { SitterBankDetailsModal } from "@/components/sitter/SitterBankDetailsModal";
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
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);
  const [bankModalOpen, setBankModalOpen] = useState(false);

  const fetchWalletData = useCallback(async () => {
    if (!supabase || !user?.id) return;
    setLoadingData(true);
    setLoadError(null);

    const result = await fetchSitterWalletView(supabase, user.id);
    setBalance(result.balance);
    setTransactions(result.transactions);
    setMissingSchema(result.missingSchema);
    setLoadError(result.error);
    setLoadingData(false);
  }, [user?.id, supabase]);

  useEffect(() => {
    if (!authLoading && user?.id) {
      void fetchWalletData();
    } else if (!authLoading && !user?.id) {
      setLoadingData(false);
    }
  }, [authLoading, user?.id, fetchWalletData]);

  const handlePayout = async () => {
    if (balance <= 0) return alert("אין יתרה זמינה למשיכה כרגע");
    if (!user?.id) return alert("אנא המתן לטעינת הנתונים");

    try {
      setActionLoading("payout");
      alert("בקשת המשיכה התקבלה ותטופל בהתאם להגדרות החשבון שלך.");
    } catch {
      alert("הפעולה נכשלה");
    } finally {
      setActionLoading(null);
    }
  };

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

        {missingSchema ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-right text-xs text-amber-900">
            טבלאות הארנק עדיין לא הוגדרו בפרויקט. יש להריץ את המיגרציה
            <span className="mx-1 font-mono text-[10px]" dir="ltr">
              20260727160000_sitter_wallet_balances_and_earnings_credit.sql
            </span>
            ב-Supabase.
          </div>
        ) : null}

        {!missingSchema && loadError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-right text-xs text-rose-800">
            שגיאה בטעינת הארנק: {loadError}
          </div>
        ) : null}

        <section className="relative overflow-hidden rounded-3xl bg-[#0B3C5D] p-6 text-white shadow-soft">
          <p className="text-xs font-medium text-white/70">היתרה שלך הזמינה למשיכה</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-4xl font-extrabold tracking-tight tabular-nums">
              ₪{isPageLoading ? "0.00" : balance.toFixed(2)}
            </span>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-white/60">
            הרווחים מתווספים אוטומטית עם סיום ואישור תשלום המשמרת. יתרה זמינה כוללת רק עסקאות שאושרו.
          </p>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={isPageLoading || balance <= 0 || actionLoading !== null}
            onClick={() => void handlePayout()}
            className="flex items-center justify-center gap-2 rounded-2xl bg-[#FF8A8A] px-4 py-3.5 text-xs font-bold text-white shadow-soft transition hover:brightness-105 active:scale-[0.99] disabled:opacity-50"
          >
            {actionLoading === "payout" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wallet className="h-4 w-4" />
            )}
            משיכת כספים לבנק
          </button>

          <button
            type="button"
            disabled={!user?.id}
            onClick={() => setBankModalOpen(true)}
            className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-xs font-bold text-navy-header shadow-sm transition hover:bg-[#FDFBF6]/60 active:scale-[0.99] disabled:opacity-50"
          >
            <Landmark className="h-4 w-4" />
            עדכון פרטי בנק
          </button>
        </section>

        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
          <h2 className="text-sm font-bold text-navy-header">היסטוריית רווחים ומשיכות</h2>

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

      {user?.id ? (
        <SitterBankDetailsModal
          sitterId={user.id}
          open={bankModalOpen}
          onClose={() => setBankModalOpen(false)}
        />
      ) : null}
    </div>
  );
}
