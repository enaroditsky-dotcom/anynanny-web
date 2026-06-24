import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Hyp (YaadPay) Webhook / IPN Handler
 * This endpoint processes successful transactions notifications from Hyp.
 */
export async function POST(request: Request) {
  let params: URLSearchParams;
  
  try {
    const text = await request.text();
    params = new URLSearchParams(text);
  } catch (e) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const terminalNumber = params.get("masof");
  const approvalNumber = params.get("Id");
  const amount = params.get("Amount");
  const info = params.get("Info") || "";

  const bookingId = info.startsWith("Booking_") ? info.replace("Booking_", "").trim() : info.trim();

  if (!bookingId || !approvalNumber) {
    return NextResponse.json({ error: "Missing required Hyp transaction parameters." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .select("id, status, payment_status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingErr || !booking) {
    console.error(`[Hyp Webhook] Booking not found for ID: ${bookingId}`);
    return NextResponse.json({ error: "Booking linkage not found." }, { status: 404 });
  }

  const { error: updateErr } = await supabase
    .from("bookings")
    .update({
      payment_status: "paid",
      paid_at: new Date().toISOString(),
      metadata: {
        gateway: "hyp_yaad",
        hyp_approval_id: approvalNumber,
        hyp_masof: terminalNumber,
        amount_paid: amount
      }
    })
    .eq("id", bookingId);

  if (updateErr) {
    console.error(`[Hyp Webhook] Failed to update booking payment state:`, updateErr.message);
    return NextResponse.json({ error: "Database transaction update failed." }, { status: 500 });
  }

  console.log(`[Hyp Webhook] Successfully processed payment for Booking: ${bookingId}, Approval ID: ${approvalNumber}`);

  return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
}