"use client";

import {
  useEffect,
  useState
} from "react";

import {
  useRouter,
  useSearchParams
} from "next/navigation";

import {
  parseHypReturnParams
} from "@/lib/billing/hyp/parse-return-params";

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
 *
 * Rules:
 *
 * 1. Success is accepted ONLY when Hyp itself reports success
 *    and /api/hyp/complete finalization succeeds.
 *
 * 2. Declined / cancelled / unknown payments are NEVER converted
 *    into success automatically.
 *
 * 3. Pending checkout data is cleared ONLY after a verified,
 *    successfully finalized payment.
 *
 * 4. Failed payments stay on this screen so the user receives
 *    an explicit message instead of being silently returned to
 *    an idle dashboard.
 */
export default function ParentCheckoutCompleteClient() {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const [
    message,
    setMessage
  ] = useState(
    "מסיימים את התשלום…"
  );

  useEffect(() => {
    let cancelled =
      false;

    void (async () => {
      const params =
        new URLSearchParams(
          searchParams.toString()
        );

      const hyp =
        parseHypReturnParams(
          params
        );

      const pending =
        readHypPendingCheckout();

      const bookingId =
        hyp.bookingId ||
        pending?.bookingId ||
        null;

      const sessionId =
        hyp.sessionId ||
        pending?.sessionId ||
        null;

      const explicitCheckout =
        params.get(
          "checkout"
        );

      /*
       * IMPORTANT:
       *
       * Do NOT assume that missing checkout=success means success.
       *
       * The old behavior converted an unknown return state into a
       * successful checkout, which could cause the dashboard flow to
       * reset even though Hyp had actually declined the card.
       */
      const checkout =
        explicitCheckout ===
          "success" ||
        explicitCheckout ===
          "cancel"
          ? explicitCheckout
          : null;

      /*
       * CANCEL
       *
       * Never mark paid. Keep pending checkout so the return page /
       * dashboard can still recover bookingId/sessionId for retry.
       * Retry must POST /api/checkout again for a fresh HYP URL.
       */
      if (
        checkout ===
        "cancel"
      ) {
        postHypCheckoutMessageToOpener(
          {
            type:
              HYP_CANCEL_MESSAGE_TYPE,
            search:
              params.toString()
          }
        );

        if (!cancelled) {
          setMessage(
            "התשלום בוטל. לא חויבת. מחזירים לדשבורד…"
          );
          router.replace(
            "/parent/dashboard?checkout=cancel"
          );
        }

        return;
      }

      /*
       * DECLINED / FAILED RETURN
       *
       * Hyp returned a CCode but did not consider it successful.
       * Never finalize it and never navigate away as if payment passed.
       */
      if (
        hyp.cCode != null &&
        String(
          hyp.cCode
        ).trim() !== "" &&
        !hyp.isSuccess
      ) {
        postHypCheckoutMessageToOpener(
          {
            type:
              HYP_CANCEL_MESSAGE_TYPE,
            search:
              params.toString()
          }
        );

        if (!cancelled) {
          setMessage(
            "התשלום נדחה. לא חויבת. מחזירים לדשבורד…"
          );
          router.replace(
            "/parent/dashboard?checkout=cancel"
          );
        }

        return;
      }

      /*
       * VERIFIED SUCCESS
       */
      if (
        checkout ===
          "success" &&
        bookingId &&
        hyp.isSuccess
      ) {
        const result =
          await finalizeHypCheckoutFromClient(
            {
              search:
                typeof window !== "undefined"
                  ? window.location.search
                  : params.toString(),
              bookingId,
              sessionId
            }
          );

        if (!result.ok) {
          console.error(
            "[checkout/complete] finalize failed:",
            result.error
          );

          /*
           * Do NOT clear pending checkout.
           * Do NOT mark paid.
           * Do NOT navigate to an idle dashboard.
           */
          if (!cancelled) {
            setMessage(
              "לא ניתן היה לאשר את התשלום. לא נסגור את המשמרת עד שהעסקה תאושר. ניתן לחזור ולנסות שוב."
            );
          }

          return;
        }

        /*
         * Payment is now verified and finalized.
         * Only now do we clear the pending checkout.
         */
        clearHypPendingCheckout();

        params.set(
          "checkout",
          "success"
        );

        params.set(
          "paid",
          "1"
        );

        postHypCheckoutMessageToOpener(
          {
            type:
              HYP_SUCCESS_MESSAGE_TYPE,
            search:
              params.toString()
          }
        );

        const target =
          `/parent/dashboard?${params.toString()}`;

        if (
          typeof window !==
            "undefined" &&
          window.top &&
          window.top !==
            window.self
        ) {
          try {
            window.top.location.href =
              target;

            return;
          } catch {
            if (!cancelled) {
              setMessage(
                "התשלום נשמר בהצלחה. ניתן לסגור חלון זה."
              );
            }

            return;
          }
        }

        router.replace(
          target
        );

        return;
      }

      /*
       * SUCCESS RETURN WITHOUT BOOKING ID
       *
       * This is not enough information to declare success.
       * The previous implementation sent a SUCCESS postMessage here,
       * which could incorrectly advance the settlement flow.
       */
      if (
        checkout ===
          "success" &&
        !bookingId
      ) {
        console.warn(
          "[checkout/complete] success return missing booking id",
          {
            hasInfo:
              Boolean(
                params.get(
                  "Info"
                )
              ),

            hasPending:
              Boolean(
                pending
              )
          }
        );

        if (!cancelled) {
          setMessage(
            "לא הצלחנו לזהות את המשמרת שאליה שייך התשלום. התשלום לא יסומן כמושלם עד שנוכל לאמת אותו."
          );
        }

        return;
      }

      /*
       * UNKNOWN STATE
       *
       * Missing checkout state and no verified Hyp success.
       * Never infer success.
       */
      console.warn(
        "[checkout/complete] unknown Hyp return state",
        {
          checkout:
            explicitCheckout,

          bookingId,

          cCode:
            hyp.cCode,

          isSuccess:
            hyp.isSuccess,

          hasPending:
            Boolean(
              pending
            )
        }
      );

      if (!cancelled) {
        setMessage(
          "לא התקבל אישור תשלום תקין. המשמרת לא תסומן כמשולמת. ניתן לחזור ולנסות שוב."
        );
      }
    })();

    return () => {
      cancelled =
        true;
    };
  }, [
    router,
    searchParams
  ]);

  return (
    <main
      className="flex min-h-[60vh] items-center justify-center px-4"
      dir="rtl"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold leading-7 text-[#001F3F]">
          {message}
        </p>

        <button
          type="button"
          onClick={() =>
            router.replace(
              "/parent/dashboard?checkout=cancel"
            )
          }
          className="mt-5 w-full rounded-xl bg-[#001F3F] px-4 py-3 text-sm font-bold text-white transition hover:brightness-110"
        >
          חזרה לדף הבית
        </button>
      </div>
    </main>
  );
}