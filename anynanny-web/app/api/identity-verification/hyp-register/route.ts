import { NextResponse } from "next/server";
import { resolveCheckoutRedirectUrl } from "@/lib/billing/checkout-redirect-url";
import { startHypIdentityVerification } from "@/lib/identity/hyp-identity-flow";
import type { IdentityVerificationRole } from "@/lib/identity/identity-verification";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_NEXT = new Set([
  "/parent/profile",
  "/parent/dashboard",
  "/parent/onboarding",
  "/sitter/profile",
  "/sitter/dashboard",
  "/sitter/onboarding"
]);

type Body = {
  role?: IdentityVerificationRole;
  next?: string;
};

function defaultNext(role: IdentityVerificationRole): string {
  return role === "sitter" ? "/sitter/profile" : "/parent/profile";
}

function sanitizeNext(role: IdentityVerificationRole, raw: string | undefined): string {
  const value = String(raw ?? "").trim();
  if (ALLOWED_NEXT.has(value)) return value;
  return defaultNext(role);
}

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

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  const role: IdentityVerificationRole = body.role === "sitter" ? "sitter" : "parent";
  const next = sanitizeNext(role, body.next);
  const returnPath = `/identity/verification/return?role=${encodeURIComponent(role)}&next=${encodeURIComponent(next)}`;

  let successUrl: string;
  let cancelUrl: string;
  try {
    successUrl = resolveCheckoutRedirectUrl(request, undefined, returnPath);
    cancelUrl = resolveCheckoutRedirectUrl(request, undefined, `${returnPath}&cancelled=1`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid redirect URL.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const result = await startHypIdentityVerification(supabase, {
    userId: user.id,
    role,
    successUrl,
    cancelUrl
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ url: result.url });
}
