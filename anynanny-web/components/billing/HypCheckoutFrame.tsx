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

import {
  parseHypReturnParams
} from "@/lib/billing/hyp/parse-return-params";

import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import {
  AlertTriangle,
  Loader2,
  X
} from "lucide-react";

export type HypCheckoutFrameProps = {
  checkoutUrl: string;

  bookingId: string;

  sessionId?:
    | string
    | null;

  busyLabel?: string;

  onClose: () => void;

  /**
   * Called only after a verified
   * HYP payment was successfully
   * finalized in Supabase.
   */
  onPaid:
    () =>
      | void
      | Promise<void>;
};

const DEFAULT_IFRAME_HEIGHT_PX =
  1400;

const MIN_IFRAME_HEIGHT_PX =
  900;

const MAX_IFRAME_HEIGHT_PX =
  4000;

function readPostedHeight(
  data: unknown
): number | null {
  if (data == null) {
    return null;
  }

  if (
    typeof data ===
      "number" &&
    Number.isFinite(
      data
    ) &&
    data > 0
  ) {
    return data;
  }

  if (
    typeof data ===
    "string"
  ) {
    const asNum =
      Number(data);

    if (
      Number.isFinite(
        asNum
      ) &&
      asNum > 100
    ) {
      return asNum;
    }

    try {
      return readPostedHeight(
        JSON.parse(data)
      );
    } catch {
      const match =
        data.match(
          /height["\s:=]+(\d{2,5})/i
        );

      if (match) {
        const n =
          Number(
            match[1]
          );

        return Number.isFinite(
          n
        )
          ? n
          : null;
      }

      return null;
    }
  }

  if (
    typeof data ===
    "object"
  ) {
    const obj =
      data as Record<
        string,
        unknown
      >;

    const candidates = [
      obj.height,
      obj.Height,
      obj.contentHeight,
      obj.iframeHeight,
      obj.pageHeight,

      (
        obj.data as
          | Record<
              string,
              unknown
            >
          | undefined
      )?.height,

      (
        obj.payload as
          | Record<
              string,
              unknown
            >
          | undefined
      )?.height
    ];

    for (
      const value
      of candidates
    ) {
      const n =
        typeof value ===
        "string"
          ? Number(value)
          : value;

      if (
        typeof n ===
          "number" &&
        Number.isFinite(
          n
        ) &&
        n > 100
      ) {
        return n;
      }
    }
  }

  return null;
}

function isSuccessfulCCode(
  value:
    | string
    | null
    | undefined
): boolean {
  const code =
    String(
      value ?? ""
    ).trim();

  return (
    code === "0"
  );
}

/**
 * IMPORTANT:
 *
 * We only treat a readable URL as payment success
 * when it contains an explicit successful HYP CCode.
 *
 * "checkout=success", "paid=1", "Thank You",
 * pathname names, redirects, etc. are NOT enough.
 */
function readVerifiedHypSuccess(
  href: string
): {
  success: boolean;
  search: string;
} {
  try {
    const url =
      new URL(href);

    const hyp =
      parseHypReturnParams(
        url.searchParams
      );

    const cCode =
      hyp.cCode ??
      url.searchParams.get(
        "CCode"
      );

    return {
      success:
        isSuccessfulCCode(
          cCode
        ),

      search:
        url.search
    };
  } catch {
    return {
      success: false,
      search: ""
    };
  }
}

/**
 * HYP checkout iframe.
 *
 * Payment safety rule:
 *
 * No automatic finalize is ever performed merely because
 * the cross-origin iframe navigated or loaded another page.
 *
 * Finalization requires an explicit successful HYP CCode.
 */
export function HypCheckoutFrame({
  checkoutUrl,
  bookingId,
  sessionId,
  busyLabel =
    "טוענים את דף התשלום המאובטח של HYP…",
  onClose,
  onPaid
}: HypCheckoutFrameProps) {
  const [
    iframeHeight,
    setIframeHeight
  ] = useState(
    DEFAULT_IFRAME_HEIGHT_PX
  );

  const [
    frameLoaded,
    setFrameLoaded
  ] = useState(false);

  const [
    finalizing,
    setFinalizing
  ] = useState(false);

  const [
    finalizeError,
    setFinalizeError
  ] =
    useState<
      string | null
    >(null);

  const [
    waitingForVerifiedResult,
    setWaitingForVerifiedResult
  ] =
    useState(false);

  const iframeRef =
    useRef<HTMLIFrameElement | null>(
      null
    );

  const loadCountRef =
    useRef(0);

  const finalizedRef =
    useRef(false);

  const onPaidRef =
    useRef(onPaid);

  onPaidRef.current =
    onPaid;

  const applyHeight =
    useCallback(
      (
        raw: number
      ) => {
        const next =
          Math.min(
            MAX_IFRAME_HEIGHT_PX,

            Math.max(
              MIN_IFRAME_HEIGHT_PX,
              Math.ceil(raw) +
                24
            )
          );

        setIframeHeight(
          (prev) =>
            Math.abs(
              prev - next
            ) < 8
              ? prev
              : next
        );
      },
      []
    );

  /**
   * Finalize ONLY using actual return parameters.
   *
   * finalizeHypCheckoutFromClient itself performs
   * another strict CCode verification.
   */
  const runFinalize =
    useCallback(
      async (
        opts: {
          search: string;
        }
      ) => {
        if (
          finalizedRef.current
        ) {
          return;
        }

        /*
         * Client-side pre-check before even
         * calling /api/hyp/complete.
         */
        const params =
          new URLSearchParams(
            opts.search.replace(
              /^\?/,
              ""
            )
          );

        const hyp =
          parseHypReturnParams(
            params
          );

        const cCode =
          hyp.cCode ??
          params.get(
            "CCode"
          );

        if (
          !isSuccessfulCCode(
            cCode
          )
        ) {
          setFinalizing(
            false
          );

          setFinalizeError(
            cCode
              ? `התשלום לא אושר על ידי HYP (CCode=${cCode}). לא חויבת.`
              : "לא התקבל אישור תשלום תקין מ-HYP. העסקה לא סומנה כמשולמת."
          );

          return;
        }

        finalizedRef.current =
          true;

        setFinalizing(
          true
        );

        setFinalizeError(
          null
        );

        setWaitingForVerifiedResult(
          false
        );

        const result =
          await finalizeHypCheckoutFromClient(
            {
              search:
                opts.search,

              bookingId,

              sessionId,

              cCode
            }
          );

        if (!result.ok) {
          finalizedRef.current =
            false;

          setFinalizing(
            false
          );

          setFinalizeError(
            result.error
          );

          return;
        }

        setFinalizing(
          false
        );

        await onPaidRef.current();
      },
      [
        bookingId,
        sessionId
      ]
    );

  useEffect(() => {
    setFrameLoaded(
      false
    );

    setIframeHeight(
      DEFAULT_IFRAME_HEIGHT_PX
    );

    setFinalizeError(
      null
    );

    setWaitingForVerifiedResult(
      false
    );

    setFinalizing(
      false
    );

    loadCountRef.current =
      0;

    finalizedRef.current =
      false;
  }, [checkoutUrl]);

  /*
   * Messages from our same-origin complete page.
   */
  useEffect(() => {
    const onMessage =
      (
        event:
          MessageEvent
      ) => {
        const origin =
          String(
            event.origin ??
              ""
          );

        /*
         * AnyNanny checkout completion messages
         * are trusted only from our own origin.
         */
        if (
          origin ===
            window.location.origin &&
          event.data &&
          typeof event.data ===
            "object"
        ) {
          const data =
            event.data as {
              type?: string;
              search?: string;
            };

          if (
            data.type ===
            HYP_SUCCESS_MESSAGE_TYPE
          ) {
            /*
             * Even a SUCCESS message must include
             * query params containing a real
             * successful HYP CCode.
             */
            void runFinalize(
              {
                search:
                  data.search ??
                  ""
              }
            );

            return;
          }

          if (
            data.type ===
            HYP_CANCEL_MESSAGE_TYPE
          ) {
            setFinalizing(
              false
            );

            setWaitingForVerifiedResult(
              false
            );

            setFinalizeError(
              "התשלום בוטל או נדחה. לא חויבת."
            );

            return;
          }
        }

        /*
         * Other HYP/Yaad messages may only be
         * used for iframe sizing.
         *
         * They are never payment proof.
         */
        const fromHyp =
          /hyp\.co\.il$/i.test(
            origin
          ) ||
          /yaad\.net$/i.test(
            origin
          ) ||
          /yaadpay/i.test(
            origin
          );

        if (
          !fromHyp &&
          origin !==
            "null"
        ) {
          const maybe =
            readPostedHeight(
              event.data
            );

          if (
            maybe == null
          ) {
            return;
          }
        }

        const height =
          readPostedHeight(
            event.data
          );

        if (
          height != null
        ) {
          applyHeight(
            height
          );
        }
      };

    window.addEventListener(
      "message",
      onMessage
    );

    return () =>
      window.removeEventListener(
        "message",
        onMessage
      );
  }, [
    applyHeight,
    runFinalize
  ]);

  useEffect(() => {
    const previous =
      document.body.style
        .overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.body.style.overflow =
        previous;
    };
  }, []);

  const handleIframeLoad =
    useCallback(() => {
      setFrameLoaded(
        true
      );

      applyHeight(
        DEFAULT_IFRAME_HEIGHT_PX
      );

      loadCountRef.current +=
        1;

      const loadCount =
        loadCountRef.current;

      const iframe =
        iframeRef.current;

      if (
        !iframe?.contentWindow
      ) {
        return;
      }

      /*
       * Same-origin return:
       *
       * We can inspect the URL safely.
       * Only explicit CCode success may finalize.
       */
      try {
        const href =
          iframe.contentWindow
            .location.href;

        const verified =
          readVerifiedHypSuccess(
            href
          );

        if (
          verified.success
        ) {
          void runFinalize(
            {
              search:
                verified.search
            }
          );

          return;
        }

        if (
          /checkout=cancel/i.test(
            href
          )
        ) {
          setWaitingForVerifiedResult(
            false
          );

          setFinalizeError(
            "התשלום בוטל. לא חויבת."
          );

          return;
        }

        /*
         * Same-origin but not verified success.
         *
         * Do nothing.
         * Never guess.
         */
        return;
      } catch {
        /*
         * Cross-origin HYP/Yaad page.
         *
         * CRITICAL:
         *
         * The old implementation did:
         *
         * loadCount >= 2
         *   → runFinalize()
         *
         * That made declined cards look paid.
         *
         * A navigation/load is NOT proof of payment.
         */
        if (
          loadCount >= 2
        ) {
          setWaitingForVerifiedResult(
            true
          );
        }
      }
    }, [
      applyHeight,
      runFinalize
    ]);

  return (
    <div
      className="fixed inset-0 z-[140] overflow-x-hidden overflow-y-auto overscroll-contain bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="תשלום HYP"
      dir="rtl"
      onClick={
        onClose
      }
    >
      <div className="flex min-h-full items-start justify-center p-3 sm:p-6">
        <div
          className="my-2 flex w-full max-w-lg flex-col overflow-visible rounded-2xl bg-white shadow-2xl"
          onClick={(
            event
          ) =>
            event.stopPropagation()
          }
        >
          <div className="sticky top-0 z-[3] flex shrink-0 items-center justify-between gap-3 rounded-t-2xl border-b border-slate-200 bg-[#001F3F] px-4 py-3 text-white">
            <p className="text-sm font-bold">
              תשלום מאובטח ·
              HYP Sandbox
            </p>

            <button
              type="button"
              onClick={
                onClose
              }
              className="rounded-full p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white"
              aria-label="סגור"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] leading-relaxed text-amber-950">
            <p className="font-bold">
              כרטיס בדיקה
              מאושר (אל
              תשתמשו ב-
              {
                HYP_SANDBOX_FAILURE_CARD.numberDisplay
              }
              )
            </p>

            <p className="mt-1 font-mono tracking-wide">
              {
                HYP_SANDBOX_SUCCESS_CARD.numberDisplay
              }{" "}
              · תוקף{" "}
              {
                HYP_SANDBOX_SUCCESS_CARD.expiryDisplay
              }{" "}
              · CVV{" "}
              {
                HYP_SANDBOX_SUCCESS_CARD.cvv
              }{" "}
              · ת.ז.{" "}
              {
                HYP_SANDBOX_SUCCESS_CARD.israeliId
              }
            </p>

            <p className="mt-1 text-amber-800/90">
              המשמרת תסומן
              כמשולמת רק לאחר
              קבלת אישור תקין
              מ-HYP.
            </p>

            <span className="sr-only">
              {hypSandboxTestCardHelpHe()}
            </span>
          </div>

          {finalizing ? (
            <div className="flex items-center justify-center gap-2 border-b border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden
              />

              <span>
                מאמתים ושומרים
                את אישור התשלום…
              </span>
            </div>
          ) : null}

          {finalizeError &&
          !finalizing ? (
            <div
              role="alert"
              className="flex items-start gap-2 border-b border-rose-200 bg-rose-50 px-4 py-3 text-right"
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-rose-600"
                aria-hidden
              />

              <div className="min-w-0">
                <p className="text-xs font-bold text-rose-900">
                  התשלום לא
                  הושלם
                </p>

                <p className="mt-1 text-[13px] leading-relaxed text-rose-700">
                  {
                    finalizeError
                  }
                </p>
              </div>
            </div>
          ) : null}

          {waitingForVerifiedResult &&
          !finalizing &&
          !finalizeError ? (
            <div className="flex items-start gap-2 border-b border-blue-200 bg-blue-50 px-4 py-3">
              <Loader2
                className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-600"
                aria-hidden
              />

              <div className="text-right">
                <p className="text-xs font-bold text-blue-900">
                  ממתינים לאישור
                  התשלום
                </p>

                <p className="mt-1 text-[13px] leading-relaxed text-blue-700">
                  לא נסמן את
                  המשמרת
                  כמשולמת עד
                  לקבלת אישור
                  תקין מ-HYP.
                </p>
              </div>
            </div>
          ) : null}

          {!frameLoaded ? (
            <div className="flex items-center justify-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden
              />

              <span>
                {busyLabel}
              </span>
            </div>
          ) : null}

          <iframe
            ref={iframeRef}
            title="HYP payment"
            src={checkoutUrl}
            className="block w-full border-0"
            style={{
              height:
                `${iframeHeight}px`,

              overflow:
                "hidden"
            }}
            scrolling="no"
            allow="payment *"
            referrerPolicy="no-referrer-when-downgrade"
            onLoad={
              handleIframeLoad
            }
          />
        </div>
      </div>
    </div>
  );
}