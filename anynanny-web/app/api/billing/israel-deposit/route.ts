import {
  createHypTransaction,
  isHypConfigured
} from "@/lib/billing/hyp/create-transaction";
import { resolveCheckoutRedirectUrl } from "@/lib/billing/checkout-redirect-url";
import { readCardcomCredentials, resolveCardcomWebhookUrl } from "@/lib/cardcom/config";
import { createCardcomLowProfile } from "@/lib/cardcom/low-profile-create";
import { createServerClient } from "@/lib/supabase/server";
import { buildHypWalletDepositInfo } from "@/lib/wallet/billing-transactions";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type DepositBody = {
  amount?: number;
  parentId?: string;
  parentName?: string;
};

/**
 * Parent wallet deposit / payment-method entrypoint.
 * Prefers Hyp Pay (configured in this project); falls back to Cardcom LowProfile.
 */
export async function POST(request: Request) {
  let body: DepositBody;
  try {
    body = (await request.json()) as DepositBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Server client initialization failed." }, { status: 500 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const amountRaw = Number(body.amount);
  if (!Number.isFinite(amountRaw) || amountRaw < 0) {
    return NextResponse.json({ error: "amount must be a non-negative number." }, { status: 400 });
  }

  const parentId = String(body.parentId ?? user.id).trim() || user.id;
  if (parentId !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const parentName =
    String(body.parentName ?? "").trim() ||
    `${user.user_metadata?.first_name ?? ""} ${user.user_metadata?.last_name ?? ""}`.trim() ||
    "הורה AnyNanny";

  let successUrl: string;
  let cancelUrl: string;
  try {
    successUrl = resolveCheckoutRedirectUrl(request, undefined, "/parent/wallet?status=success");
    cancelUrl = resolveCheckoutRedirectUrl(request, undefined, "/parent/wallet?status=cancel");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid redirect URL.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // amount === 0 → card registration / verification (Hyp requires a small positive amount).
  const isTokenOnly = amountRaw === 0;
  const chargeAmount = isTokenOnly ? 1 : amountRaw;
  const description = isTokenOnly
    ? "אימות / רישום אמצעי תשלום — AnyNanny"
    : "טעינת ארנק דיגיטלי — AnyNanny";

  if (isHypConfigured()) {
    try {
      const walletInfo = buildHypWalletDepositInfo(parentId);
      const hyp = await createHypTransaction({
        amountNis: chargeAmount,
        bookingId: walletInfo,
        description,
        paymentMethod: "credit_card",
        pageLang: "HEB",
        clientName: parentName.split(/\s+/)[0] || "Parent",
        clientLastName: parentName.split(/\s+/).slice(1).join(" ") || "AnyNanny",
        successUrl,
        cancelUrl,
        // Echo parent id on return/IPN for wallet credit (not a booking UUID).
        shiftSessionId: null
      });

      // Put wallet marker in MoreData via a second sign if needed — Info already carries WalletDeposit_<uuid>.
      // createHypTransaction stores bookingId in Info; parseHypWalletDepositParentId reads it.

      return NextResponse.json({
        url: hyp.checkoutUrl,
        sessionId: hyp.sessionId,
        gateway: "hyp",
        amount: chargeAmount,
        tokenOnly: isTokenOnly
      });
    } catch (error) {
      console.error("[israel-deposit] Hyp failed:", error);
      // Fall through to Cardcom if configured.
      if (!readCardcomCredentials()) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Hyp payment initiation failed. Check HYP_* environment variables."
          },
          { status: 502 }
        );
      }
    }
  }

  const cardcom = readCardcomCredentials();
  if (!cardcom) {
    return NextResponse.json(
      {
        error:
          "Payment gateway is not configured. Set HYP_* (preferred) or CARDCOM_* environment variables."
      },
      { status: 500 }
    );
  }

  try {
    const result = await createCardcomLowProfile({
      terminalNumber: cardcom.terminalNumber,
      apiName: cardcom.apiName,
      apiPassword: cardcom.apiPassword,
      apiUrl: cardcom.apiUrl,
      sumToBill: chargeAmount,
      description,
      successUrl,
      cancelUrl,
      returnValue: parentId,
      customerEmail: user.email ?? null,
      customerName: parentName,
      webhookUrl: resolveCardcomWebhookUrl(request)
    });

    if (!result.ok) {
      console.error("[israel-deposit] Cardcom failed:", result.error);
      return NextResponse.json({ error: result.error }, { status: result.httpStatus ?? 502 });
    }

    return NextResponse.json({
      url: result.url,
      sessionId: result.lowProfileId,
      gateway: "cardcom",
      amount: chargeAmount,
      tokenOnly: isTokenOnly
    });
  } catch (error) {
    console.error("[israel-deposit] Cardcom exception:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Payment network error."
      },
      { status: 502 }
    );
  }
}
