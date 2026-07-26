"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

export type HypCheckoutFrameProps = {
  checkoutUrl: string;
  busyLabel?: string;
  onClose: () => void;
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

/**
 * Hyp sandbox checkout shell.
 * Single outer scrollbar only — iframe grows to content height (no nested iframe scroll).
 */
export function HypCheckoutFrame({
  checkoutUrl,
  busyLabel = "טוענים את דף התשלום המאובטח של HYP…",
  onClose
}: HypCheckoutFrameProps) {
  const [iframeHeight, setIframeHeight] = useState(DEFAULT_IFRAME_HEIGHT_PX);
  const [frameLoaded, setFrameLoaded] = useState(false);

  const applyHeight = useCallback((raw: number) => {
    const next = Math.min(
      MAX_IFRAME_HEIGHT_PX,
      Math.max(MIN_IFRAME_HEIGHT_PX, Math.ceil(raw) + 24)
    );
    setIframeHeight((prev) => (Math.abs(prev - next) < 8 ? prev : next));
  }, []);

  useEffect(() => {
    setFrameLoaded(false);
    setIframeHeight(DEFAULT_IFRAME_HEIGHT_PX);
  }, [checkoutUrl]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Hyp/Yaad hosts — ignore unrelated frames.
      const origin = String(event.origin ?? "");
      const fromHyp =
        /hyp\.co\.il$/i.test(origin) ||
        /yaad\.net$/i.test(origin) ||
        /yaadpay/i.test(origin) ||
        origin === window.location.origin;

      if (!fromHyp && origin !== "null") {
        // Still accept plain numeric height payloads from sandboxed children.
        const maybe = readPostedHeight(event.data);
        if (maybe == null) return;
      }

      const height = readPostedHeight(event.data);
      if (height != null) applyHeight(height);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [applyHeight]);

  // Lock background page scroll while the overlay owns scrolling.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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

          {!frameLoaded ? (
            <div className="flex items-center justify-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              <span>{busyLabel}</span>
            </div>
          ) : null}

          <iframe
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
            onLoad={() => {
              setFrameLoaded(true);
              // Cross-origin: cannot read contentDocument. Keep a tall default
              // so Hyp’s internal form fits; postMessage may refine height.
              applyHeight(DEFAULT_IFRAME_HEIGHT_PX);
            }}
          />
        </div>
      </div>
    </div>
  );
}
