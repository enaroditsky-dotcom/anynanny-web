"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import { ArrowUpRight, ArrowDownLeft, ChevronDown, Copy, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { MainLayout } from "@/components/layout/MainLayout";
import { PageBackLink } from "@/components/navigation/page-back-link";
import { APP_SHELL_SCROLL_ID } from "@/lib/ui/app-shell";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchParentWalletView } from "@/lib/wallet/parent-wallet";
import { sanitizeManualPaymentDestinations } from "@/lib/billing/payment-method-availability";
import type { ManualPaymentDestinations } from "@/lib/billing/manual-payment-ui";
import type { BillingTransaction } from "@/lib/wallet/billing-transactions";

/** Visible history rows before the list scrolls internally. */
const WALLET_HISTORY_VISIBLE_ROWS = 6;
/**
 * Measured row box is 4rem: p-3 plus two text lines, which are taller than the h-8 icon.
 * space-y-2 adds 0.5rem between rows.
 * 6 rows = 6 * 4rem + 5 * 0.5rem = 26.5rem (424px).
 * On short screens the list max-height is tightened to the space above BottomNav.
 */
const WALLET_HISTORY_LIST_MAX_CLASS =
  "max-h-[26.5rem] min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] [scrollbar-color:rgb(148_163_184/0.45)_transparent] [scrollbar-width:thin]";

/**
 * AppShellGate pads the scrollport by
 * 6.5rem + --anynanny-now-dock + safe-area-inset-bottom for the fixed BottomNav.
 * The wallet frame is sized to that content box minus MainLayout's bottom padding.
 * pb-3 on the frame is the cream gap under the history card so its rounded
 * bottom corners and shadow stay above the nav. The 1rem in the fallback is
 * MainLayout pb-4. The 3rem is the app-shell header.
 */
const WALLET_FRAME_MAX_CLASS =
  "max-h-[calc(100dvh-3rem-env(safe-area-inset-top,0px)-6.5rem-var(--anynanny-now-dock,0px)-env(safe-area-inset-bottom,0px)-1rem)]";

const WALLET_NO_PAYMENT_METHODS_COPY =
  "לא הוגדרו אמצעי תשלום. מומלץ להתקין ולהגדיר Bit ו־PayBox, ולאחר מכן לעדכן כאן את מספרי הטלפון.";

type WalletPaymentPhones = {
  bit: string | null;
  paybox: string | null;
};

function useWalletHistoryFrame(layoutKey: string) {
  const frameRef = useRef<HTMLDivElement>(null);
  const upperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const scroller = document.getElementById(APP_SHELL_SCROLL_ID);
    if (!frame || !scroller) return;

    const fit = () => {
      const upper = upperRef.current;
      const list = listRef.current;
      frame.style.height = "";
      frame.style.maxHeight = "";
      if (upper) {
        upper.style.maxHeight = "";
        upper.style.overflowY = "";
      }
      if (list) list.style.maxHeight = "";

      const scrollerStyle = getComputedStyle(scroller);
      const padBottom = Number.parseFloat(scrollerStyle.paddingBottom) || 0;
      const scrollerRect = scroller.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      const offset = Math.max(0, frameRect.top - scrollerRect.top + scroller.scrollTop);
      const main = frame.parentElement;
      const mainPadBottom = main
        ? Number.parseFloat(getComputedStyle(main).paddingBottom) || 0
        : 0;
      const available = Math.floor(scroller.clientHeight - padBottom - offset - mainPadBottom);
      if (!Number.isFinite(available) || available < 220) return;

      frame.style.height = `${available}px`;
      frame.style.maxHeight = `${available}px`;

      if (!list) return;
      const rootPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const sixRows =
        (WALLET_HISTORY_VISIBLE_ROWS * 4 + (WALLET_HISTORY_VISIBLE_ROWS - 1) * 0.5) * rootPx;
      const card = list.parentElement;
      const cardPadBottom = card
        ? Number.parseFloat(getComputedStyle(card).paddingBottom) || 0
        : 0;

      const roomForList = () => {
        const contentBottom =
          frame.getBoundingClientRect().bottom -
          (Number.parseFloat(getComputedStyle(frame).paddingBottom) || 0);
        return Math.floor(contentBottom - list.getBoundingClientRect().top - cardPadBottom);
      };

      let room = roomForList();
      if (upper && room < 96) {
        const deficit = 96 - room;
        const upperMax = Math.max(72, upper.getBoundingClientRect().height - deficit);
        upper.style.maxHeight = `${Math.floor(upperMax)}px`;
        upper.style.overflowY = "auto";
        room = roomForList();
      }
      if (room < 64) return;
      list.style.maxHeight = `${Math.min(sixRows, room)}px`;
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(scroller);
    window.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
      frame.style.height = "";
      frame.style.maxHeight = "";
      if (upperRef.current) {
        upperRef.current.style.maxHeight = "";
        upperRef.current.style.overflowY = "";
      }
      if (listRef.current) listRef.current.style.maxHeight = "";
    };
  }, [layoutKey]);

  return { frameRef, upperRef, listRef };
}

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
  const [paymentPhones, setPaymentPhones] = useState<WalletPaymentPhones | null>(null);
  const [copiedPhone, setCopiedPhone] = useState<"bit" | "paybox" | null>(null);
  const { frameRef, upperRef, listRef } = useWalletHistoryFrame(
    `${paymentAppsOpen}:${loadingData}:${transactions.length}:${paymentPhones?.bit ?? ""}:${paymentPhones?.paybox ?? ""}`
  );

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

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id || !supabase) {
      setPaymentPhones({ bit: null, paybox: null });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("bookings")
          .select("id")
          .eq("parent_id", user.id)
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(5);
        if (error || !data?.length) {
          if (!cancelled) setPaymentPhones({ bit: null, paybox: null });
          return;
        }
        let bit: string | null = null;
        let paybox: string | null = null;
        for (const row of data) {
          const bookingId = String((row as { id?: string }).id ?? "");
          if (!bookingId) continue;
          const res = await fetch(
            `/api/parent/manual-payment-destinations?bookingId=${encodeURIComponent(bookingId)}`,
            { method: "GET", credentials: "same-origin", cache: "no-store" }
          );
          if (!res.ok) continue;
          const json = (await res.json()) as ManualPaymentDestinations;
          const safe = sanitizeManualPaymentDestinations(json);
          bit = safe?.bit.destination ?? null;
          paybox = safe?.paybox.destination ?? null;
          if (bit || paybox) break;
        }
        if (!cancelled) setPaymentPhones({ bit, paybox });
      } catch (err) {
        console.warn("[parent-wallet] payment phones failed:", err);
        if (!cancelled) setPaymentPhones({ bit: null, paybox: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, supabase, user?.id]);

  const copyPaymentPhone = async (kind: "bit" | "paybox", phone: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(phone.replace(/-/g, ""));
      setCopiedPhone(kind);
      window.setTimeout(() => setCopiedPhone((current) => (current === kind ? null : current)), 1600);
    } catch {
      setCopiedPhone(null);
    }
  };

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
      <div
        ref={frameRef}
        className={`mx-auto flex w-full min-h-0 min-w-0 max-w-md flex-col overflow-hidden pb-3 ${WALLET_FRAME_MAX_CLASS}`}
        dir="rtl"
      >
        <div ref={upperRef} className="min-h-0 shrink space-y-5 overflow-x-hidden">
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
              <span className="text-sm font-bold text-navy-header">אמצעי תשלום</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                  paymentAppsOpen ? "rotate-180" : ""
                }`}
                aria-hidden
              />
            </button>
          </h2>

          {paymentAppsOpen ? (
            <div id="parent-wallet-payment-apps" className="min-w-0">
              {paymentPhones == null ? (
                <div className="mt-3 flex items-center justify-center gap-2 py-2 text-xs text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin text-navy-header" aria-hidden />
                  <span>טוענים אמצעי תשלום…</span>
                </div>
              ) : !paymentPhones.bit && !paymentPhones.paybox ? (
                <p className="mt-3 break-words text-[13px] leading-relaxed text-slate-500">
                  {WALLET_NO_PAYMENT_METHODS_COPY}
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-1 gap-2.5">
                  {(
                    [
                      paymentPhones.bit
                        ? {
                            id: "bit" as const,
                            label: "Bit",
                            phone: paymentPhones.bit,
                            logoSrc: "/wallet/bit-logo.png",
                            logoAlt: "bit"
                          }
                        : null,
                      paymentPhones.paybox
                        ? {
                            id: "paybox" as const,
                            label: "PayBox",
                            phone: paymentPhones.paybox,
                            logoSrc: "/wallet/paybox-logo.png",
                            logoAlt: "PayBox"
                          }
                        : null
                    ].filter((row) => row != null)
                  ).map((row) => (
                    <div
                      key={row.id}
                      className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-right"
                    >
                      <Image
                        src={row.logoSrc}
                        alt={row.logoAlt}
                        width={40}
                        height={40}
                        className="h-10 w-10 shrink-0 rounded-xl object-cover"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-800">
                          {row.label}
                        </span>
                        <span
                          className="mt-0.5 block whitespace-nowrap text-sm font-semibold tabular-nums tracking-wide text-slate-700"
                          dir="ltr"
                        >
                          {row.phone}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void copyPaymentPhone(row.id, row.phone)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                        {copiedPhone === row.id ? "הועתק" : "העתקה"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </section>
        </div>

        <section className="mt-5 min-w-0 shrink-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
          <h2 className="text-sm font-bold text-navy-header">פירוט תשלומים</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
            היסטוריית התנועות שנרשמו בארנק.
          </p>

          <div
            ref={listRef}
            className={`mt-3 min-w-0 space-y-2 ${WALLET_HISTORY_LIST_MAX_CLASS}`}
          >
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
