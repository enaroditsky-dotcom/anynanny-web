"use client";

import { useEffect, useState, useCallback } from "react";
import { CreditCard, Plus, ArrowUpRight, ArrowDownLeft, Loader2, RefreshCw, ArrowLeft } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { MainLayout } from "@/components/layout/MainLayout";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import Link from "next/link";

type Transaction = {
  id: string;
  type: "deposit" | "payment" | "refund";
  amount: number;
  description: string;
  created_at: string;
  status: "succeeded" | "pending" | "failed";
};

export default function ParentWalletClient() {
  const { user, isLoading: authLoading } = useAuth();
  const supabase = createClientComponentClient<any>();

  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchWalletData = useCallback(async () => {
    if (!user?.id) return;
    setLoadingData(true);

    // 1. שליפת יתרה מוגנת
    try {
      const { data: wallet, error: walletError } = await supabase
        .from("parent_wallet_balances")
        .select("balance")
        .eq("parent_id", user.id)
        .maybeSingle();

      if (!walletError && wallet) {
        setBalance(wallet.balance || 0);
      } else {
        setBalance(0);
      }
    } catch (err) {
      console.warn("Table parent_wallet_balances might be missing, using default 0.");
      setBalance(0);
    }

    // 2. שליפת פעולות מוגנת
    try {
      const { data: txData, error: txError } = await supabase
        .from("billing_transactions")
        .select("id, type, amount, description, created_at, status")
        .eq("parent_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (!txError && txData) {
        setTransactions(txData as Transaction[]);
      } else {
        setTransactions([]);
      }
    } catch (err) {
      console.warn("Table billing_transactions might be missing, using empty array.");
      setTransactions([]);
    }

    setLoadingData(false);
  }, [user?.id, supabase]);

  useEffect(() => {
    if (!authLoading && user?.id) {
      fetchWalletData();
    } else if (!authLoading && !user?.id) {
      setLoadingData(false); // מניעת תקיעה במצב טעינה אם אין יוזר
    }
  }, [authLoading, user?.id, fetchWalletData]);

  const handleManagePaymentMethods = async () => {
    if (!user?.id) return alert("אנא המתן לטעינת נתוני המשתמש");
    try {
      setActionLoading("payment");
      const res = await fetch("/api/billing/israel-deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          amount: 0,
          parentId: user.id,
          parentName:
            `${user.user_metadata?.first_name ?? ""} ${user.user_metadata?.last_name ?? ""}`.trim() ||
            "משתמש AnyNanny"
        }) 
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || "שגיאה בפתיחת ממשק ניהול כרטיסים");
    } catch (err) {
      alert("חיבור הרשת נכשל");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeposit = async () => {
    if (!user?.id) return alert("אנא המתן לטעינת נתוני המשתמש");
    try {
      setActionLoading("deposit");
      const res = await fetch("/api/billing/israel-deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          amount: 100,
          parentId: user.id,
          parentName:
            `${user.user_metadata?.first_name ?? ""} ${user.user_metadata?.last_name ?? ""}`.trim() ||
            "הורה AnyNanny"
        }) 
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || "שגיאה בייצור בקשת ההפקדה המקומית");
    } catch (err) {
      alert("חיבור הרשת נכשל");
    } finally {
      setActionLoading(null);
    }
  };

  const isPageLoading = authLoading || loadingData;

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-md space-y-5" dir="rtl">
        
        {/* שורת כפתורי ניווט עליונה - תמיד תתרנדר כעת */}
        <div className="w-full flex justify-between items-center px-1 pt-2">
          <button 
            type="button"
            onClick={() => fetchWalletData()} 
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

        {/* כרטיס יתרה */}
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

        {/* כפתורי פעולה */}
        <section className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={isPageLoading || actionLoading !== null}
            onClick={handleDeposit}
            className="flex items-center justify-center gap-2 rounded-2xl bg-[#FF8A8A] px-4 py-3.5 text-xs font-bold text-white shadow-soft transition hover:brightness-105 active:scale-[0.99] disabled:opacity-60"
          >
            {actionLoading === "deposit" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            הטען כסף לארנק
          </button>

          <button
            type="button"
            disabled={isPageLoading || actionLoading !== null}
            onClick={handleManagePaymentMethods}
            className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-xs font-bold text-navy-header shadow-sm transition hover:bg-[#FDFBF6]/60 active:scale-[0.99] disabled:opacity-60"
          >
            {actionLoading === "payment" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            אמצעי תשלום
          </button>
        </section>

        {/* פעולות אחרונות */}
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
                <p className="mt-1 text-[11px] text-slate-500">כאשר תבצעי תשלום או טעינה, התנועות יופיעו כאן.</p>
              </div>
            ) : (
              transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 bg-[#FDFBF6]/20">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tx.type === "deposit" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                      {tx.type === "deposit" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 text-right">
                      <p className="truncate text-xs font-bold text-slate-800">{tx.description}</p>
                      <p className="text-[10px] text-slate-400 tabular-nums">{new Date(tx.created_at).toLocaleDateString("he-IL")}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-bold tabular-nums ${tx.type === "deposit" ? "text-emerald-600" : "text-slate-700"}`}>
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