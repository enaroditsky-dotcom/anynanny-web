import { createServerClient } from "@/lib/supabase/server";
import { parseHypReturnParams } from "@/lib/billing/hyp/parse-return-params";
import {
  parseHypWalletPaymentMethodParentId,
  saveHypPaymentMethodFromTransId
} from "@/lib/wallet/parent-payment-methods";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Client fallback when Hyp redirects to /parent/wallet after card registration.
 * Persists Token via getToken using the Hyp transaction Id from the return URL.
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

  let body: { search?: string; params?: Record<string, string> };
  try {
    body = (await request.json()) as { search?: string; params?: Record<string, string> };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseHypReturnParams(body.search ?? body.params ?? "");
  if (!parsed.isSuccess) {
    return NextResponse.json({ error: "Hyp return was not successful." }, { status: 400 });
  }

  const info = parsed.raw.Info ?? parsed.raw.info ?? "";
  const parentFromInfo = parseHypWalletPaymentMethodParentId(info);
  if (parentFromInfo && parentFromInfo !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const transId = parsed.approvalId;
  if (!transId) {
    return NextResponse.json({ error: "Missing Hyp transaction Id." }, { status: 400 });
  }

  const saved = await saveHypPaymentMethodFromTransId(supabase, {
    parentId: user.id,
    transId,
    israeliId: parsed.raw.UserId ?? parsed.raw.userid ?? null,
    brandHint: parsed.raw.Brand ?? parsed.raw.CardName ?? null,
    makeDefault: true
  });

  if (saved.error) {
    return NextResponse.json({ error: saved.error }, { status: 400 });
  }

  return NextResponse.json({ method: saved.method });
}
