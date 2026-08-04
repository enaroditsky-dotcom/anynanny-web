"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseHypReturnParams } from "@/lib/billing/hyp/parse-return-params";
import {
  clearHypPendingCheckout,
  readHypPendingCheckout
} from "@/lib/billing/hyp/pending-checkout";
import {
  finalizeHypCheckoutFromClient,
  postHypCheckoutMessageToOpener,
  HYP_CANCEL_MESSAGE_TYPE,
  HYP_SUCCESS_MESSAGE_TYPE
} from "@/lib/billing/hyp/finalize-client";

/**
 * Hyp success/cancel return target.
 * Finalizes payment against Supabase *before* returning to the dashboard,
 * notifies the parent iframe host via postMessage, then breaks out if needed.
 */
export default function ParentCheckoutCompleteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("מסיימים את התשלום…");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const params = new URLSearchParams(searchParams.toString());
      if (!params.get("checkout")) {
        params.set("checkout", "success");
      }

      const checkout = params.get("checkout");
      const hyp = parseHypReturnParams(params);
      const pending = readHypPendingCheckout();

      const bookingId = hyp.bookingId || pending?.bookingId || null;

      if (checkout === "cancel") {
        postHypCheckoutMessageToOpener({
          type: HYP_CANCEL_MESSAGE_TYPE,
          search: params.toString()
        });
      } else if (checkout === "success" && bookingId && hyp.isSuccess) {
        const result = await finalizeHypCheckoutFromClient({
          search: params,
          bookingId,
          sessionId: hyp.sessionId || pending?.sessionId
        });

        if (!result.ok) {
          console.error("[checkout/complete] finalize failed:", result.error);
          if (!cancelled) {
            setMessage(result.error ?? "לא ניתן לשמור את אישור התשלום. מעבירים לדשבורד…");
          }
        } else {
          clearHypPendingCheckout();
          params.set("paid", "1");
          postHypCheckoutMessageToOpener({
            type: HYP_SUCCESS_MESSAGE_TYPE,
            search: params.toString()
          });
        }
      } else if (checkout === "success" && !bookingId) {
        console.warn("[checkout/complete] success return missing booking id", {
          hasInfo: Boolean(params.get("Info")),
          hasPending: Boolean(pending)
        });
        // Still notify parent frame — it may finalize from pending stash.
        postHypCheckoutMessageToOpener({
          type: HYP_SUCCESS_MESSAGE_TYPE,
          search: params.toString()
        });
      }

      const target = `/parent/dashboard?${params.toString()}`;

      if (typeof window !== "undefined" && window.top && window.top !== window.self) {
        try {
          window.top.location.href = target;
          return;
        } catch {
          // Cross-origin top — postMessage already sent; stay on complete page briefly.
          if (!cancelled) setMessage("התשלום נשמר. ניתן לסגור חלון זה.");
          return;
        }
      }

      router.replace(target);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FDFBF6] p-6" dir="rtl">
      <p className="text-sm font-medium text-slate-600 animate-pulse">{message}</p>
    </main>
  );
}
