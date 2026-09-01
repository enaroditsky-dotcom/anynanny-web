import {
  hebrewReportManualPaymentError,
  loadAuthorizedManualPaymentDestinations,
  methodHasAuthorizedDestination,
  parseReportManualPaymentMethod,
  tryGetSupabaseServiceRoleClient
} from "@/lib/billing/parent-manual-payment-server";
import { parsePaymentBookingIdParam } from "@/lib/bookings/payment-status-label";
import { notifySitterManualPaymentReported } from "@/lib/notifications/create-notification";
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

  let body: { bookingId?: string; paymentMethod?: string };
  try {
    body = (await request.json()) as { bookingId?: string; paymentMethod?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const bookingId = parsePaymentBookingIdParam(body.bookingId);
  const paymentMethod = parseReportManualPaymentMethod(body.paymentMethod);
  if (!bookingId || !paymentMethod) {
    return NextResponse.json({ error: "אמצעי תשלום או הזמנה לא תקינים." }, { status: 400 });
  }

  if (paymentMethod === "bit" || paymentMethod === "paybox") {
    const destinations = await loadAuthorizedManualPaymentDestinations(supabase, {
      actorId: user.id,
      bookingId
    });
    if (!destinations.ok) {
      return NextResponse.json({ error: destinations.error }, { status: destinations.status });
    }
    if (!methodHasAuthorizedDestination(paymentMethod, destinations.destinations)) {
      return NextResponse.json(
        { error: "אמצעי התשלום שנבחר אינו זמין עבור נני זו." },
        { status: 400 }
      );
    }
  }

  const rpc = await supabase.rpc("report_manual_payment", {
    p_booking_id: bookingId,
    p_payment_method: paymentMethod
  });

  if (rpc.error) {
    return NextResponse.json(
      { error: hebrewReportManualPaymentError(rpc.error.message) },
      { status: 400 }
    );
  }

  const payload = (rpc.data ?? {}) as {
    ok?: boolean;
    noop?: boolean;
    payment_status?: string;
    booking_id?: string;
  };

  const booking = await supabase
    .from("bookings")
    .select("id, sitter_id, payment_status")
    .eq("id", bookingId)
    .eq("parent_id", user.id)
    .maybeSingle();

  const sitterId = String(
    (booking.data as { sitter_id?: string | null } | null)?.sitter_id ?? ""
  ).trim();
  const admin = tryGetSupabaseServiceRoleClient();
  if (sitterId && admin && payload.noop !== true) {
    await notifySitterManualPaymentReported(admin, {
      sitterId,
      bookingId,
      paymentMethod
    });
  }

  return NextResponse.json({
    ok: payload.ok !== false,
    noop: payload.noop === true,
    bookingId,
    paymentStatus: payload.payment_status ?? "awaiting_sitter_confirmation",
    paymentMethod
  });
}
