import { parseHypReturnParams } from "@/lib/billing/hyp/parse-return-params";
import {
  clearHypPendingCheckout,
  readHypPendingCheckout
} from "@/lib/billing/hyp/pending-checkout";

export const HYP_SUCCESS_MESSAGE_TYPE = "anynanny-hyp-checkout-success";
export const HYP_CANCEL_MESSAGE_TYPE = "anynanny-hyp-checkout-cancel";

export type HypFinalizeClientResult =
  | { ok: true; bookingId: string; sessionIds?: string[] }
  | { ok: false; error: string };

/**
 * POST /api/hyp/complete using Hyp return params and/or the pending-checkout stash.
 * Used by the complete page, dashboard return handler, and iframe Thank-You fallback.
 */
export async function finalizeHypCheckoutFromClient(input?: {
  search?: string | URLSearchParams;
  bookingId?: string | null;
  sessionId?: string | null;
  hypApprovalId?: string | null;
  amountPaid?: string | null;
  cCode?: string | null;
}): Promise<HypFinalizeClientResult> {
  const params =
    input?.search instanceof URLSearchParams
      ? input.search
      : new URLSearchParams(
          typeof input?.search === "string"
            ? input.search.replace(/^\?/, "")
            : typeof window !== "undefined"
              ? window.location.search
              : ""
        );

  const hyp = parseHypReturnParams(params);
  const pending = readHypPendingCheckout();

  const bookingId =
    (input?.bookingId && String(input.bookingId).trim()) ||
    hyp.bookingId ||
    pending?.bookingId ||
    null;

  const sessionId =
    (input?.sessionId && String(input.sessionId).trim()) ||
    hyp.sessionId ||
    pending?.sessionId ||
    null;

  if (!bookingId) {
    return {
      ok: false,
      error: "Missing booking id for Hyp finalize."
    };
  }

  if (hyp.cCode != null && String(hyp.cCode).trim() !== "" && !hyp.isSuccess) {
    return { ok: false, error: `Hyp payment was not successful (CCode=${hyp.cCode}).` };
  }

  const cCode =
    input?.cCode ??
    hyp.cCode ??
    // Sandbox demo Thank You page often never reaches our app — treat as success
    // only when we already have a pending checkout for this parent session.
    (pending?.bookingId ? "0" : undefined);

  try {
    const res = await fetch("/api/hyp/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        bookingId,
        sessionId: sessionId || undefined,
        hypApprovalId:
          input?.hypApprovalId ?? hyp.approvalId ?? params.get("Id") ?? undefined,
        amountPaid: input?.amountPaid ?? hyp.amount ?? params.get("Amount") ?? undefined,
        cCode,
        hypQuery: params.toString() || undefined,
        Info: params.get("Info") ?? undefined,
        MoreData: params.get("MoreData") ?? undefined,
        Order: params.get("Order") ?? undefined,
        Id: params.get("Id") ?? undefined,
        Amount: params.get("Amount") ?? undefined,
        CCode: params.get("CCode") ?? cCode
      })
    });

    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      bookingId?: string;
      sessionIds?: string[];
    };

    if (!res.ok) {
      return { ok: false, error: json.error ?? `Finalize failed (${res.status}).` };
    }

    clearHypPendingCheckout();
    return {
      ok: true,
      bookingId: json.bookingId ?? bookingId,
      sessionIds: json.sessionIds
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Finalize network error."
    };
  }
}

export function postHypCheckoutMessageToOpener(payload: {
  type: typeof HYP_SUCCESS_MESSAGE_TYPE | typeof HYP_CANCEL_MESSAGE_TYPE;
  search?: string;
}): void {
  if (typeof window === "undefined") return;
  const message = {
    type: payload.type,
    search: payload.search ?? window.location.search
  };
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, window.location.origin);
    }
  } catch {
    // ignore
  }
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(message, window.location.origin);
    }
  } catch {
    // ignore
  }
}
