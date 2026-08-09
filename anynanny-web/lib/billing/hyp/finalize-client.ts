import { parseHypReturnParams } from "@/lib/billing/hyp/parse-return-params";

import {
  clearHypPendingCheckout,
  readHypPendingCheckout
} from "@/lib/billing/hyp/pending-checkout";

export const HYP_SUCCESS_MESSAGE_TYPE =
  "anynanny-hyp-checkout-success";

export const HYP_CANCEL_MESSAGE_TYPE =
  "anynanny-hyp-checkout-cancel";

export type HypFinalizeClientResult =
  | {
      ok: true;
      bookingId: string;
      sessionIds?: string[];
    }
  | {
      ok: false;
      error: string;
    };

function normalizeCCode(
  value: string | null | undefined
): string | null {
  const normalized =
    String(value ?? "").trim();

  return normalized || null;
}

function isSuccessfulCCode(
  value: string | null | undefined
): boolean {
  const code =
    normalizeCCode(value);

  return (
    code === "0" ||
    code === "00"
  );
}

/**
 * Finalize a HYP payment from the browser.
 *
 * SECURITY / PAYMENT RULE:
 *
 * A payment is finalized ONLY when we have an explicit successful
 * HYP CCode.
 *
 * We NEVER infer success from:
 * - a pending checkout existing
 * - iframe navigation
 * - a "Thank You" page
 * - checkout=success alone
 * - paid=1 alone
 *
 * This prevents a declined transaction from being marked as paid.
 */
export async function finalizeHypCheckoutFromClient(
  input?: {
    search?:
      | string
      | URLSearchParams;

    bookingId?:
      | string
      | null;

    sessionId?:
      | string
      | null;

    hypApprovalId?:
      | string
      | null;

    amountPaid?:
      | string
      | null;

    cCode?:
      | string
      | null;
  }
): Promise<HypFinalizeClientResult> {
  const params =
    input?.search instanceof
    URLSearchParams
      ? new URLSearchParams(
          input.search.toString()
        )
      : new URLSearchParams(
          typeof input?.search ===
          "string"
            ? input.search.replace(
                /^\?/,
                ""
              )
            : typeof window !==
                "undefined"
              ? window.location.search
              : ""
        );

  const hyp =
    parseHypReturnParams(
      params
    );

  const pending =
    readHypPendingCheckout();

  const bookingId =
    (
      input?.bookingId &&
      String(
        input.bookingId
      ).trim()
    ) ||
    hyp.bookingId ||
    pending?.bookingId ||
    null;

  const sessionId =
    (
      input?.sessionId &&
      String(
        input.sessionId
      ).trim()
    ) ||
    hyp.sessionId ||
    pending?.sessionId ||
    null;

  if (!bookingId) {
    return {
      ok: false,
      error:
        "Missing booking id for Hyp finalize."
    };
  }

  /*
   * IMPORTANT:
   *
   * cCode must come from HYP itself
   * or be explicitly supplied by a caller
   * that already received the HYP result.
   *
   * Never manufacture CCode=0 from the
   * existence of a pending checkout.
   */
  const cCode =
    normalizeCCode(
      input?.cCode ??
        hyp.cCode ??
        params.get("CCode")
    );

  if (!cCode) {
    return {
      ok: false,
      error:
        "לא התקבל קוד אישור תשלום מ-HYP. העסקה לא סומנה כמשולמת."
    };
  }

  if (
    !isSuccessfulCCode(
      cCode
    )
  ) {
    return {
      ok: false,
      error:
        `התשלום נדחה על ידי HYP (CCode=${cCode}).`
    };
  }

  /*
   * Even if some URL parameter says "success",
   * the explicit successful CCode is the
   * authoritative client-side requirement.
   */
  try {
    const res =
      await fetch(
        "/api/hyp/complete",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          credentials:
            "same-origin",

          body:
            JSON.stringify({
              bookingId,

              sessionId:
                sessionId ||
                undefined,

              hypApprovalId:
                input?.hypApprovalId ??
                hyp.approvalId ??
                params.get("Id") ??
                undefined,

              amountPaid:
                input?.amountPaid ??
                hyp.amount ??
                params.get(
                  "Amount"
                ) ??
                undefined,

              cCode,

              hypQuery:
                params.toString() ||
                undefined,

              Info:
                params.get(
                  "Info"
                ) ??
                undefined,

              MoreData:
                params.get(
                  "MoreData"
                ) ??
                undefined,

              Order:
                params.get(
                  "Order"
                ) ??
                undefined,

              Id:
                params.get(
                  "Id"
                ) ??
                undefined,

              Amount:
                params.get(
                  "Amount"
                ) ??
                undefined,

              CCode:
                cCode
            })
        }
      );

    const json =
      (await res
        .json()
        .catch(
          () => ({})
        )) as {
        error?: string;
        bookingId?: string;
        sessionIds?: string[];
      };

    if (!res.ok) {
      return {
        ok: false,
        error:
          json.error ??
          `Finalize failed (${res.status}).`
      };
    }

    /*
     * Only a successfully finalized payment
     * is allowed to clear the pending checkout.
     */
    clearHypPendingCheckout();

    return {
      ok: true,

      bookingId:
        json.bookingId ??
        bookingId,

      sessionIds:
        json.sessionIds
    };
  } catch (error) {
    return {
      ok: false,

      error:
        error instanceof Error
          ? error.message
          : "Finalize network error."
    };
  }
}

export function postHypCheckoutMessageToOpener(
  payload: {
    type:
      | typeof HYP_SUCCESS_MESSAGE_TYPE
      | typeof HYP_CANCEL_MESSAGE_TYPE;

    search?: string;
  }
): void {
  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  const message = {
    type:
      payload.type,

    search:
      payload.search ??
      window.location.search
  };

  try {
    if (
      window.parent &&
      window.parent !==
        window
    ) {
      window.parent.postMessage(
        message,
        window.location.origin
      );
    }
  } catch {
    // best effort
  }

  try {
    if (
      window.opener &&
      !window.opener.closed
    ) {
      window.opener.postMessage(
        message,
        window.location.origin
      );
    }
  } catch {
    // best effort
  }
}