import { runParentResolveManualPaymentDispute } from "@/lib/billing/parent-manual-payment-server";
import { parsePaymentBookingIdParam } from "@/lib/bookings/payment-status-label";
import { createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  let body: { bookingId?: string };
  try {
    body = (await request.json()) as { bookingId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const bookingId = parsePaymentBookingIdParam(body.bookingId);
  if (!bookingId) {
    return NextResponse.json({ error: "חסר מזהה הזמנה." }, { status: 400 });
  }

  const result = await runParentResolveManualPaymentDispute(supabase, {
    actorId: user.id,
    bookingId
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    noop: result.noop,
    bookingId: result.bookingId,
    paymentStatus: result.paymentStatus,
    paymentMethod: result.paymentMethod
  });
}
