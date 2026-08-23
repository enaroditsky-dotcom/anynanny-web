import {
  createHypTransaction,
  isHypConfigured
} from "@/lib/billing/hyp/create-transaction";
import {
  hypPaymentMethodDescription,
  validateHypWalletAmount
} from "@/lib/billing/hyp/payment-method-flags";
import { resolveCheckoutRedirectUrl } from "@/lib/billing/checkout-redirect-url";
import { createServerClient } from "@/lib/supabase/server";
import { buildHypWalletDepositInfo } from "@/lib/wallet/billing-transactions";
import { buildHypWalletPaymentMethodInfo } from "@/lib/wallet/parent-payment-methods";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type DepositBody = {
  amount?: number;
  parentId?: string;
  parentName?: string;
  /** `deposit` (default) or `payment_method` for card registration via Hyp. */
  purpose?: "deposit" | "payment_method";
  /** Preferred Hyp rail when opening the hosted page. */
  paymentMethod?: "credit_card" | "bit" | "paybox" | "wallet";
};

/**
 * Parent wallet deposit / payment-method entrypoint.
 * HYP Pay is the only current payment provider.
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

  const purpose = body.purpose === "payment_method" || amountRaw === 0 ? "payment_method" : "deposit";

  const parentName =
    String(body.parentName ?? "").trim() ||
    `${user.user_metadata?.first_name ?? ""} ${user.user_metadata?.last_name ?? ""}`.trim() ||
    "הורה AnyNanny";

  let successUrl: string;
  let cancelUrl: string;
  try {
    successUrl = resolveCheckoutRedirectUrl(
      request,
      undefined,
      purpose === "payment_method"
        ? "/parent/wallet?status=success&pm=1"
        : "/parent/wallet?status=success"
    );
    cancelUrl = resolveCheckoutRedirectUrl(request, undefined, "/parent/wallet?status=cancel");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid redirect URL.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const isTokenOnly = purpose === "payment_method";
  const chargeAmount = isTokenOnly ? Math.max(1, amountRaw || 1) : amountRaw;
  if (!isTokenOnly && chargeAmount <= 0) {
    return NextResponse.json({ error: "deposit amount must be > 0." }, { status: 400 });
  }

  const preferredMethod =
    body.paymentMethod === "bit" || body.paymentMethod === "paybox" || body.paymentMethod === "wallet"
      ? body.paymentMethod
      : "credit_card";

  const amountError = validateHypWalletAmount(preferredMethod, chargeAmount);
  if (amountError) {
    return NextResponse.json({ error: amountError }, { status: 400 });
  }

  const description = hypPaymentMethodDescription(
    preferredMethod,
    isTokenOnly ? "payment_method" : "deposit"
  );

  const hypInfo = isTokenOnly
    ? buildHypWalletPaymentMethodInfo(parentId)
    : buildHypWalletDepositInfo(parentId);

  if (!isHypConfigured()) {
    return NextResponse.json(
      {
        error:
          "Hyp is not configured. Set HYP_MASOF (or HYP_TERMINAL_ID), HYP_API_KEY, HYP_PASSP, and HYP_USER."
      },
      { status: 503 }
    );
  }

  try {
    const hyp = await createHypTransaction({
      amountNis: chargeAmount,
      bookingId: hypInfo,
      description,
      paymentMethod: preferredMethod,
      pageLang: "HEB",
      clientName: parentName.split(/\s+/)[0] || "Parent",
      clientLastName: parentName.split(/\s+/).slice(1).join(" ") || "AnyNanny",
      successUrl,
      cancelUrl,
      shiftSessionId: null
    });

    return NextResponse.json({
      url: hyp.checkoutUrl,
      sessionId: hyp.sessionId,
      gateway: "hyp",
      amount: chargeAmount,
      tokenOnly: isTokenOnly,
      purpose,
      paymentMethod: preferredMethod
    });
  } catch (error) {
    console.error("[israel-deposit] Hyp failed:", error);
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
