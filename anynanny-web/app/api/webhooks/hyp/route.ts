import { finalizeHypPaymentSuccess } from "@/lib/billing/finalize-hyp-payment";
import {
  isHypSuccessCCode,
  parseHypReturnParams
} from "@/lib/billing/hyp/parse-return-params";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import {
  creditParentWalletDeposit,
  parseHypWalletDepositParentId
} from "@/lib/wallet/billing-transactions";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Hyp (YaadPay) Webhook / IPN Handler.
 * Uses the service-role client — IPN has no user cookies, so anon RLS cannot update.
 */
export async function POST(request: Request) {
  let params: URLSearchParams;

  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      params = new URLSearchParams();
      for (const [k, v] of Object.entries(json)) {
        if (v != null) params.set(k, String(v));
      }
    } else {
      const text = await request.text();
      params = new URLSearchParams(text);
    }
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const parsed = parseHypReturnParams(params);
  const terminalNumber = params.get("masof") ?? params.get("Masof");
  const approvalNumber = parsed.approvalId;
  const amount = parsed.amount;
  const bookingId = parsed.bookingId;
  const sessionId = parsed.sessionId;
  const infoRaw = params.get("Info") ?? params.get("info") ?? parsed.raw.Info ?? parsed.raw.info ?? "";
  const moreDataRaw =
    params.get("MoreData") ?? params.get("moredata") ?? parsed.raw.MoreData ?? parsed.raw.moredata ?? "";
  const walletParentId =
    parseHypWalletDepositParentId(infoRaw) || parseHypWalletDepositParentId(moreDataRaw);

  if (!isHypSuccessCCode(parsed.cCode)) {
    console.warn(`[Hyp Webhook] Ignoring non-success CCode=${parsed.cCode}`, {
      bookingId,
      approvalNumber,
      walletParentId
    });
    return new NextResponse("IGNORED", {
      status: 200,
      headers: { "Content-Type": "text/plain" }
    });
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

  // Parent wallet top-up (Info = WalletDeposit_<parentUuid>) — not a shift booking.
  if (walletParentId) {
    const depositAmount = Number(amount);
    if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
      return NextResponse.json({ error: "Invalid wallet deposit amount." }, { status: 400 });
    }

    const credit = await creditParentWalletDeposit(supabase, {
      parentId: walletParentId,
      amount: depositAmount,
      description: `טעינת ארנק מוצלח (Hyp #${approvalNumber ?? "0"})`
    });

    if (credit.error) {
      console.error("[Hyp Webhook] Wallet deposit failed:", credit.error, {
        walletParentId,
        approvalNumber
      });
      return NextResponse.json({ error: credit.error }, { status: 500 });
    }

    console.log(
      `[Hyp Webhook] Wallet deposit ok parent=${walletParentId} amount=${depositAmount} approval=${approvalNumber}`
    );
    return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  if (!bookingId || !approvalNumber) {
    return NextResponse.json(
      { error: "Missing required Hyp transaction parameters (Info/booking + Id)." },
      { status: 400 }
    );
  }

  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .select("id, parent_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingErr || !booking?.parent_id) {
    console.error(`[Hyp Webhook] Booking not found for ID: ${bookingId}`, bookingErr);
    return NextResponse.json({ error: "Booking linkage not found." }, { status: 404 });
  }

  const result = await finalizeHypPaymentSuccess(supabase, {
    bookingId,
    sessionId,
    parentId: String(booking.parent_id),
    hypApprovalId: approvalNumber,
    amountPaid: amount
  });

  if (!result.ok) {
    console.error(`[Hyp Webhook] Finalize failed:`, result.error, {
      terminalNumber,
      approvalNumber,
      bookingId
    });
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  console.log(
    `[Hyp Webhook] Successfully processed payment for Booking: ${bookingId}, Approval ID: ${approvalNumber}, sessions: ${result.sessionIds.join(",")}`
  );

  return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
}
