import { completeVerifiedHypPayment } from "@/lib/billing/complete-verified-hyp-payment";
import { createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CompleteBody = {
  bookingId?: string;
  sessionId?: string;
  /** Raw Hyp success-return query. Required for APISign What=VERIFY. */
  hypQuery?: string;
};

/**
 * Browser Hyp return is a hint only.
 * Payment is marked paid only after server-side APISign What=VERIFY.
 */
export async function POST(request: Request) {
  let body: CompleteBody;
  try {
    body = (await request.json()) as CompleteBody;
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

  const originalQuery = String(body.hypQuery ?? "").trim();
  if (!originalQuery) {
    return NextResponse.json(
      { error: "hypQuery (original Hyp return parameters) is required." },
      { status: 400 }
    );
  }

  const result = await completeVerifiedHypPayment(supabase, {
    parentId: user.id,
    bookingId: body.bookingId,
    sessionId: body.sessionId,
    originalQuery
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, pending: true },
      { status: result.status }
    );
  }

  return NextResponse.json({
    ok: true,
    status: "paid",
    bookingId: result.bookingId,
    sessionIds: result.sessionIds,
    noop: result.noop
  });
}
