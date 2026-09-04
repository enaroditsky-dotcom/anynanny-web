import { NextResponse } from "next/server";
import { resolveCheckoutRedirectUrl } from "@/lib/billing/checkout-redirect-url";
import {
  insertDiditSession,
  markDiditProfilePending
} from "@/lib/identity/didit-db";
import { DIDIT_WORKFLOW_ID, readDiditApiKey } from "@/lib/identity/didit";
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
  const apiKey = readDiditApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "Didit is not configured." }, { status: 503 });
  }

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
  const returnPath = `/verify/done?role=${encodeURIComponent(role)}&next=${encodeURIComponent(next)}`;

  let callback: string;
  try {
    callback = resolveCheckoutRedirectUrl(request, undefined, returnPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid redirect URL.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const res = await fetch("https://verification.didit.me/v3/session/", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      workflow_id: DIDIT_WORKFLOW_ID,
      vendor_data: user.id,
      callback,
      language: "he",
      metadata: { role, next }
    })
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json({ error: "session_create_failed", detail }, { status: 502 });
  }

  const session = (await res.json()) as {
    url?: string;
    session_id?: string;
    status?: string;
  };

  if (!session.url || !session.session_id) {
    return NextResponse.json({ error: "session_create_failed", detail: "missing url" }, { status: 502 });
  }

  const stored = await insertDiditSession(supabase, {
    sessionId: session.session_id,
    userId: user.id,
    role,
    workflowId: DIDIT_WORKFLOW_ID,
    status: session.status,
    metadata: { role, next }
  });
  if (stored.error && !stored.missingSchema) {
    return NextResponse.json({ error: stored.error }, { status: 500 });
  }

  await markDiditProfilePending(supabase, user.id);

  return NextResponse.json({ url: session.url, session_id: session.session_id });
}
