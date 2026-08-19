import { completeVerifiedHypPayment } from "@/lib/billing/complete-verified-hyp-payment";
import { hasSufficientHypVerifyPayload } from "@/lib/billing/hyp/verify-transaction";
import {
  applyHypIdentityVerificationResult,
  parseHypIdentityVerificationUserId
} from "@/lib/identity/hyp-identity-flow";
import { parseHypReturnParams } from "@/lib/billing/hyp/parse-return-params";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import {
  parseHypWalletDepositParentId
} from "@/lib/wallet/billing-transactions";
import { parseHypWalletPaymentMethodParentId } from "@/lib/wallet/parent-payment-methods";
import { NextResponse } from "next/server";

function ack(status: string): Response {
  return new NextResponse(status, {
    status: 200,
    headers: { "Content-Type": "text/plain" }
  });
}

function rawQueryFromParams(params: URLSearchParams): string {
  return params.toString();
}

/**
 * Shared Hyp Pay IPN handler.
 * Booking payment is finalized only when the payload can be passed through
 * official APISign What=VERIFY. Unsigned/incomplete callbacks are acknowledged
 * but left pending.
 */
export async function handleHypPaymentWebhook(request: Request): Promise<Response> {
  let rawBody = "";
  let params: URLSearchParams;
  const contentType = request.headers.get("content-type") || "";

  try {
    rawBody = await request.text();
    if (contentType.includes("application/json")) {
      const json = JSON.parse(rawBody || "{}") as Record<string, unknown>;
      params = new URLSearchParams();
      for (const [k, v] of Object.entries(json)) {
        if (v != null) params.set(k, String(v));
      }
    } else {
      params = new URLSearchParams(rawBody.replace(/^\?/, ""));
    }
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const originalQuery = contentType.includes("application/json")
    ? ""
    : rawBody.trim()
      ? rawBody.trim().replace(/^\?/, "")
      : rawQueryFromParams(params);
  const parsed = parseHypReturnParams(params);
  const infoRaw = params.get("Info") ?? params.get("info") ?? parsed.raw.Info ?? parsed.raw.info ?? "";
  const moreDataRaw =
    params.get("MoreData") ?? params.get("moredata") ?? parsed.raw.MoreData ?? parsed.raw.moredata ?? "";
  const identityUserId =
    parseHypIdentityVerificationUserId(infoRaw) || parseHypIdentityVerificationUserId(moreDataRaw);

  if (identityUserId) {
    let supabase;
    try {
      supabase = getSupabaseServiceRoleClient();
    } catch (error) {
      console.error("[Hyp Webhook] Service role client unavailable:", error);
      return NextResponse.json(
        { error: "Server misconfigured (SUPABASE_SERVICE_ROLE_KEY)." },
        { status: 500 }
      );
    }

    const applied = await applyHypIdentityVerificationResult(supabase, {
      userId: identityUserId,
      parsed
    });
    if (applied.error) {
      console.error("[Hyp Webhook] Identity verification update failed:", applied.error, {
        userId: identityUserId,
        idStatusOutcome: applied.idStatusOutcome,
        lookupKind: applied.lookupKind
      });
      return NextResponse.json({ error: applied.error }, { status: 500 });
    }

    console.info("[Hyp Webhook] Identity verification processed", {
      userId: identityUserId,
      outcome: applied.idStatusOutcome,
      lookupKind: applied.lookupKind,
      status: applied.record.status
    });
    return ack("OK");
  }

  const walletParentId =
    parseHypWalletDepositParentId(infoRaw) || parseHypWalletDepositParentId(moreDataRaw);
  const paymentMethodParentId =
    parseHypWalletPaymentMethodParentId(infoRaw) || parseHypWalletPaymentMethodParentId(moreDataRaw);

  if (walletParentId || paymentMethodParentId) {
    console.info("[Hyp Webhook] Wallet/payment-method IPN ignored until documented VERIFY payload is present", {
      hasSign: hasSufficientHypVerifyPayload(originalQuery),
      wallet: Boolean(walletParentId),
      paymentMethod: Boolean(paymentMethodParentId)
    });
    return ack("IGNORED_UNVERIFIED_WALLET");
  }

  if (!hasSufficientHypVerifyPayload(originalQuery)) {
    console.warn("[Hyp Webhook] Shift IPN missing documented VERIFY fields; payment left pending", {
      hasCCode: Boolean(parsed.cCode),
      hasId: Boolean(parsed.approvalId),
      hasAmount: Boolean(parsed.amount),
      hasSign: /(?:^|&)Sign=/i.test(originalQuery)
    });
    return ack("IGNORED_UNVERIFIABLE");
  }

  let supabase;
  try {
    supabase = getSupabaseServiceRoleClient();
  } catch (error) {
    console.error("[Hyp Webhook] Service role client unavailable:", error);
    return NextResponse.json(
      { error: "Server misconfigured (SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 }
    );
  }

  const bookingId = parsed.bookingId;
  if (!bookingId) {
    console.warn("[Hyp Webhook] VERIFY payload present but booking correlation missing; left pending");
    return ack("IGNORED_UNCORRELATED");
  }

  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .select("id, parent_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingErr || !booking?.parent_id) {
    console.error(`[Hyp Webhook] Booking not found for ID: ${bookingId}`, bookingErr);
    return ack("IGNORED_UNKNOWN_BOOKING");
  }

  const result = await completeVerifiedHypPayment(supabase, {
    parentId: String(booking.parent_id),
    bookingId,
    sessionId: parsed.sessionId,
    originalQuery
  });

  if (!result.ok) {
    console.warn("[Hyp Webhook] Verified finalize declined; payment left pending", {
      bookingId,
      error: result.error
    });
    return ack("IGNORED_VERIFY_FAILED");
  }

  console.info("[Hyp Webhook] Verified payment finalized", {
    bookingId: result.bookingId,
    sessionIds: result.sessionIds,
    noop: result.noop
  });

  return ack("OK");
}
