import { NextResponse } from "next/server";
import {
  applyHypIdentityVerificationResult,
  parseHypIdentityVerificationUserId,
  parseIdentityHypReturnSource
} from "@/lib/identity/hyp-identity-flow";
import { maskIsraeliId, type IdentityVerificationRole } from "@/lib/identity/identity-verification";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  search?: string;
  params?: Record<string, string>;
  cancelled?: boolean;
  role?: IdentityVerificationRole;
};

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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = parseIdentityHypReturnSource(body.search ?? body.params ?? "");
  const info = parsed.raw.Info ?? parsed.raw.info ?? "";
  const fromInfo = parseHypIdentityVerificationUserId(info);
  if (fromInfo && fromInfo !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const cancelled =
    body.cancelled === true ||
    String(parsed.raw.cancelled ?? parsed.raw.Cancelled ?? "").trim() === "1";

  const applied = await applyHypIdentityVerificationResult(supabase, {
    userId: user.id,
    role: body.role === "sitter" ? "sitter" : "parent",
    parsed,
    cancelled
  });

  if (applied.error) {
    return NextResponse.json({ error: applied.error }, { status: 400 });
  }

  return NextResponse.json({
    status: applied.record.status,
    verifiedAt: applied.record.verifiedAt,
    method: applied.record.method,
    idNumberMasked: applied.record.idNumber ? maskIsraeliId(applied.record.idNumber) : "",
    idStatusOutcome: applied.idStatusOutcome,
    lookupKind: applied.lookupKind
  });
}
