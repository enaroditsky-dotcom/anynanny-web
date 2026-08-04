"use client";

import {
  HYP_SANDBOX_FAILURE_CARD,
  HYP_SANDBOX_SUCCESS_CARD,
  hypSandboxTestCardHelpHe
} from "@/lib/billing/hyp/sandbox-test-cards";
import {
  finalizeHypCheckoutFromClient,
  HYP_CANCEL_MESSAGE_TYPE,
  HYP_SUCCESS_MESSAGE_TYPE
} from "@/lib/billing/hyp/finalize-client";
import { parseHypReturnParams } from "@/lib/billing/hyp/parse-return-params";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";

export type HypCheckoutFrameProps = {
  checkoutUrl: string;
  bookingId: string;
  sessionId?: string | null;
  busyLabel?: string;
  onClose: () => void;
  /** Called after Supabase finalize succeeds (booking/session → paid). */
  onPaid: () => void | Promise<void>;
};

/** Fallback when Hyp/Yaad does not post a content height (cross-origin). */
const DEFAULT_IFRAME_HEIGHT_PX = 1400;
const MIN_IFRAME_HEIGHT_PX = 900;
const MAX_IFRAME_HEIGHT_PX = 4000;

function readPostedHeight(data: unknown): number | null {
  if (data == null) return null;

  if (typeof data === "number" && Number.isFinite(data) && data > 0) {
    return data;
  }

  if (typeof data === "string") {
    const asNum = Number(data);
    if (Number.isFinite(asNum) && asNum > 100) return asNum;
    try {
      return readPostedHeight(JSON.parse(data));
    } catch {
      const match = data.match(/height["\s:=]+(\d{2,5})/i);
      if (match) {
        const n = Number(match[1]);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    }
  }

  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const candidates = [
      obj.height,
      obj.Height,
      obj.contentHeight,
      obj.iframeHeight,
      obj.pageHeight,
      (obj.data as Record<string, unknown> | undefined)?.height,
      (obj.payload as Record<string, unknown> | undefined)?.height
    ];
    for (const value of candidates) {
      const n = typeof value === "string" ? Number(value) : value;
      if (typeof n === "number" && Number.isFinite(n) && n > 100) return n;
    }
  }

  return null;
}

function looksLikeHypSuccessHref(href: string): boolean {
  try {
    const url = new URL(href);
    const hyp = parseHypReturnParams(url.searchParams);
    if (hyp.isSuccess && (hyp.cCode === "0" || hyp.cCode === "00" || hyp.approvalId)) {
      return true;
    }
    if (/checkout=success/i.test(url.search) || /paid=1/i.test(url.search)) return true;
    if (/yaadsuccess|thank.?you|successpage/i.test(url.href)) return true;
  } catch {
    if (/CCode=0(?:&|$)/i.test(href) || /yaadsuccess/i.test(href)) return true;
  }
  return false;
}

/**
 * Hyp sandbox checkout shell.
 * Finalizes Supabase when:
 *  - iframe redirects to our /parent/checkout/complete (same-origin), or
 *  - Hyp demo Thank You page loads (cross-origin 2nd navigation) → pending finalize.
 */
export function HypCheckoutFrame({
  checkoutUrl,
  bookingId,
  sessionId,
  busyLabel = "טוענים את דף התשלום המאובטח של HYP…",
  onClose,
  onPaid
}: HypCheckoutFrameProps) {
  const [iframeHeight, setIframeHeight] = useState(DEFAULT_IFRAME_HEIGHT_PX);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [showConfirmPaid, setShowConfirmPaid] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const loadCountRef = useRef(0);
  const finalizedRef = useRef(false);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const applyHeight = useCallback((raw: number) => {
    const next = Math.min(
      MAX_IFRAME_HEIGHT_PX,
      Math.max(MIN_IFRAME_HEIGHT_PX, Math.ceil(raw) + 24)
    );
    setIframeHeight((prev) => (Math.abs(prev - next) < 8 ? prev : next));
  }, []);

  const runFinalize = useCallback(
    async (opts?: { search?: string; force?: boolean }) => {
      if (finalizedRef.current && !opts?.force) return;
      finalizedRef.current = true;
      setFinalizing(true);
      setFinalizeError(null);

      const result = await finalizeHypCheckoutFromClient({
        search: opts?.search,
        bookingId,
        sessionId
      });

      if (!result.ok) {
        finalizedRef.current = false;
        setFinalizing(false);
        setFinalizeError(result.error);
        setShowConfirmPaid(true);
        return;
      }

      setFinalizing(false);
      await onPaidRef.current();
    },
    [bookingId, sessionId]
  );

  useEffect(() => {
    setFrameLoaded(false);
    setIframeHeight(DEFAULT_IFRAME_HEIGHT_PX);
    setFinalizeError(null);
    setShowConfirmPaid(false);
    setFinalizing(false);
    loadCountRef.current = 0;
    finalizedRef.current = false;
  }, [checkoutUrl]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const origin = String(event.origin ?? "");
      const fromHyp =
        /hyp\.co\.il$/i.test(origin) ||
        /yaad\.net$/i.test(origin) ||
        /yaadpay/i.test(origin) ||
        origin === window.location.origin;

      if (origin === window.location.origin && event.data && typeof event.data === "object") {
        const data = event.data as { type?: string; search?: string };
        if (data.type === HYP_SUCCESS_MESSAGE_TYPE) {
          void runFinalize({ search: data.search });
          return;
        }
        if (data.type === HYP_CANCEL_MESSAGE_TYPE) {
          onClose();
          return;
        }
      }

      if (!fromHyp && origin !== "null") {
        const maybe = readPostedHeight(event.data);
        if (maybe == null) return;
      }

      const height = readPostedHeight(event.data);
      if (height != null) applyHeight(height);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [applyHeight, onClose, runFinalize]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleIframeLoad = useCallback(() => {
    setFrameLoaded(true);
    applyHeight(DEFAULT_IFRAME_HEIGHT_PX);
    loadCountRef.current += 1;
    const loadCount = loadCountRef.current;

    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    // Same-origin success (our complete page) — parse and finalize immediately.
    try {
      const href = iframe.contentWindow.location.href;
      if (looksLikeHypSuccessHref(href)) {
        const search = new URL(href).search;
        void runFinalize({ search });
        return;
      }
      if (/checkout=cancel/i.test(href)) {
        onClose();
        return;
      }
    } catch {
      // Cross-origin Hyp / Yaad demo Thank You page — cannot read CCode.
      // After the payment form (load 1), the next navigation is usually success/error.
      if (loadCount >= 2) {
        setShowConfirmPaid(true);
        // Auto-finalize: parent already started checkout; Hyp showed Thank You in sandbox.
        window.setTimeout(() => {
          if (!finalizedRef.current) void runFinalize();
        }, 600);
      }
    }
  }, [applyHeight, onClose, runFinalize]);

  return (
    <div
      className="fixed inset-0 z-[140] overflow-x-hidden overflow-y-auto overscroll-contain bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="תשלום HYP"
      dir="rtl"
      onClick={onClose}
    >
      <div className="flex min-h-full items-start justify-center p-3 sm:p-6">
        <div
          className="my-2 flex w-full max-w-lg flex-col overflow-visible rounded-2xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 z-[3] flex shrink-0 items-center justify-between gap-3 rounded-t-2xl border-b border-slate-200 bg-[#001F3F] px-4 py-3 text-white">
            <p className="text-sm font-bold">תשלום מאובטח · HYP Sandbox</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white"
              aria-label="סגור"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-[11px] leading-relaxed text-amber-950">
            <p className="font-bold">
              כרטיס בדיקה מאושר (אל תשתמשו ב-{HYP_SANDBOX_FAILURE_CARD.numberDisplay})
            </p>
            <p className="mt-1 font-mono tracking-wide">
              {HYP_SANDBOX_SUCCESS_CARD.numberDisplay} · תוקף{" "}
              {HYP_SANDBOX_SUCCESS_CARD.expiryDisplay} · CVV {HYP_SANDBOX_SUCCESS_CARD.cvv} · ת.ז.{" "}
              {HYP_SANDBOX_SUCCESS_CARD.israeliId}
            </p>
            <p className="mt-1 text-amber-800/90">
              אחרי &quot;Thank You / Success&quot; אנחנו מעדכנים את Supabase אוטומטית.
            </p>
            <span className="sr-only">{hypSandboxTestCardHelpHe()}</span>
          </div>

          {finalizing ? (
            <div className="flex items-center justify-center gap-2 border-b border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              <span>שומרים את אישור התשלום ב-Supabase…</span>
            </div>
          ) : null}

          {showConfirmPaid && !finalizing ? (
            <div className="flex flex-col gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-semibold text-emerald-950">
                אם הופיע Thank You / Success בדף HYP — לחצו לאישור כדי לעדכן את הדשבורד של הבייביסיטר.
              </p>
              {finalizeError ? (
                <p className="text-[11px] text-rose-700">{finalizeError}</p>
              ) : null}
              <button
                type="button"
                onClick={() => void runFinalize({ force: true })}
                className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800"
              >
                התשלום הצליח — עדכנו את המערכת
              </button>
            </div>
          ) : null}

          {!frameLoaded ? (
            <div className="flex items-center justify-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              <span>{busyLabel}</span>
            </div>
          ) : null}

          <iframe
            ref={iframeRef}
            title="HYP payment"
            src={checkoutUrl}
            className="block w-full border-0"
            style={{
              height: `${iframeHeight}px`,
              overflow: "hidden"
            }}
            scrolling="no"
            allow="payment *"
            referrerPolicy="no-referrer-when-downgrade"
            onLoad={handleIframeLoad}
          />
        </div>
      </div>
    </div>
  );
}
