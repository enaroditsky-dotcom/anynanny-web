import { NextResponse } from "next/server";
import { parseHypReturnParams } from "@/lib/billing/hyp/parse-return-params";
import { createServerClient } from "@/lib/supabase/server";
import {
  parseHypSitterPayoutMethodSitterId,
  saveHypSitterPayoutFromTransId
} from "@/lib/wallet/sitter-payout-methods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * After Hyp redirects to /sitter/wallet?status=success&pm=1 — persist getToken on sitter_profiles.
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
  const sitterFromInfo = parseHypSitterPayoutMethodSitterId(info);
  if (sitterFromInfo && sitterFromInfo !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const transId = parsed.approvalId;
  if (!transId) {
    return NextResponse.json({ error: "Missing Hyp transaction Id." }, { status: 400 });
  }

  const saved = await saveHypSitterPayoutFromTransId(supabase, {
    sitterId: user.id,
    transId,
    israeliId: parsed.raw.UserId ?? parsed.raw.userid ?? null,
    brandHint: parsed.raw.Brand ?? parsed.raw.CardName ?? null
  });

  if (saved.error) {
    return NextResponse.json({ error: saved.error }, { status: 400 });
  }

  return NextResponse.json({ methods: saved.methods });
}
