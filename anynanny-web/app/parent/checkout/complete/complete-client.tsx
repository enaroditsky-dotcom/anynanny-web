"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseHypReturnParams } from "@/lib/billing/hyp/parse-return-params";
import {
  clearHypPendingCheckout,
  readHypPendingCheckout
} from "@/lib/billing/hyp/pending-checkout";

/**
 * Hyp success/cancel return target.
 * Finalizes payment against Supabase *before* returning to the dashboard,
 * then breaks out of the iframe if needed.
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
      const sessionId = hyp.sessionId || pending?.sessionId || null;

      if (checkout === "success" && bookingId && hyp.isSuccess) {
        try {
          const res = await fetch("/api/hyp/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              bookingId,
              sessionId: sessionId ?? undefined,
              hypApprovalId: hyp.approvalId ?? undefined,
              amountPaid: hyp.amount ?? undefined,
              cCode: hyp.cCode ?? undefined,
              hypQuery: params.toString(),
              Info: params.get("Info") ?? undefined,
              MoreData: params.get("MoreData") ?? undefined,
              Order: params.get("Order") ?? undefined,
              Id: params.get("Id") ?? undefined,
              Amount: params.get("Amount") ?? undefined,
              CCode: params.get("CCode") ?? undefined
            })
          });
          if (!res.ok) {
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            console.error("[checkout/complete] finalize failed:", json.error ?? res.status);
            if (!cancelled) {
              setMessage(json.error ?? "לא ניתן לשמור את אישור התשלום. מעבירים לדשבורד…");
            }
          } else {
            clearHypPendingCheckout();
            params.set("paid", "1");
          }
        } catch (e) {
          console.error("[checkout/complete] finalize error:", e);
          if (!cancelled) setMessage("שגיאה בסגירת התשלום. מעבירים לדשבורד…");
        }
      } else if (checkout === "success" && !bookingId) {
        console.warn("[checkout/complete] success return missing booking id", {
          hasInfo: Boolean(params.get("Info")),
          hasPending: Boolean(pending)
        });
      }

      const target = `/parent/dashboard?${params.toString()}`;

      if (typeof window !== "undefined" && window.top && window.top !== window.self) {
        window.top.location.href = target;
        return;
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
