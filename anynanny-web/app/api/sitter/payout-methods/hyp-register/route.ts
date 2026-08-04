import { NextResponse } from "next/server";
import {
  createHypTransaction,
  isHypConfigured
} from "@/lib/billing/hyp/create-transaction";
import { resolveCheckoutRedirectUrl } from "@/lib/billing/checkout-redirect-url";
import { createServerClient } from "@/lib/supabase/server";
import {
  buildHypSitterPayoutMethodInfo,
  saveSitterPayoutMethods
} from "@/lib/wallet/sitter-payout-methods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  sitterName?: string;
  cardHolder?: string;
  cardIdNumber?: string;
};

/**
 * Start Hyp hosted card registration for sitter payout tokenization.
 * Returns a checkout URL; on return, `/api/sitter/payout-methods/complete` stores the token.
 */
export async function POST(request: Request) {
  const supabase = await createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isHypConfigured()) {
    return NextResponse.json(
      { error: "HYP אינו מוגדר בשרת. לא ניתן לרשום כרטיס למשיכה חיה." },
      { status: 503 }
    );
  }

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  const sitterName =
    String(body.sitterName ?? "").trim() ||
    `${user.user_metadata?.first_name ?? ""} ${user.user_metadata?.last_name ?? ""}`.trim() ||
    "שמרטפית AnyNanny";

  // Persist holder / ID hints before redirect so the complete step can merge them.
  if (body.cardHolder || body.cardIdNumber) {
    await saveSitterPayoutMethods(supabase, user.id, {
      cardHolder: body.cardHolder,
      cardIdNumber: body.cardIdNumber,
      preferred: "card"
    });
  }

  let successUrl: string;
  let cancelUrl: string;
  try {
    successUrl = resolveCheckoutRedirectUrl(
      request,
      undefined,
      "/sitter/wallet?status=success&pm=1"
    );
    cancelUrl = resolveCheckoutRedirectUrl(request, undefined, "/sitter/wallet?status=cancel");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid redirect URL.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const hyp = await createHypTransaction({
      amountNis: 1,
      bookingId: buildHypSitterPayoutMethodInfo(user.id),
      description: "רישום כרטיס למשיכת שכר — AnyNanny (HYP)",
      paymentMethod: "credit_card",
      pageLang: "HEB",
      userId: String(body.cardIdNumber ?? "").replace(/\D/g, "") || null,
      clientName: sitterName.split(/\s+/)[0] || "Sitter",
      clientLastName: sitterName.split(/\s+/).slice(1).join(" ") || "AnyNanny",
      successUrl,
      cancelUrl,
      shiftSessionId: null
    });

    return NextResponse.json({
      url: hyp.checkoutUrl,
      sessionId: hyp.sessionId,
      gateway: "hyp",
      purpose: "payout_method"
    });
  } catch (error) {
    console.error("[sitter/payout-methods/hyp-register]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "פתיחת הרשמת HYP נכשלה."
      },
      { status: 502 }
    );
  }
}
