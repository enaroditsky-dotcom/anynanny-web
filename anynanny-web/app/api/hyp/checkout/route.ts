"use client";



import { resolveCheckoutRedirectUrl } from "@/lib/stripe/redirect-url";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { NextResponse } from "next/server";



export const runtime = "nodejs";



type CheckoutBody = {

  amountMinorUnits?: number; // מגיע בסנטים/אגורות (למשל 5000 עבור 50 ש"ח)

  currency?: string;

  description?: string;

  successUrl?: string;

  cancelUrl?: string;

  metadata?: Record<string, string>;

  bookingId?: string;

};



/** After shift work or wrap-up — not for unpaid future slots. */

const PAYABLE_BOOKING_STATUSES = new Set(["completed", "sitter_ended", "parent_started"]);



export async function POST(request: Request) {

  let body: CheckoutBody;

  try {

    body = (await request.json()) as CheckoutBody;

  } catch {

    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  }



  const amountMinorUnits = Number(body.amountMinorUnits);

  if (!Number.isInteger(amountMinorUnits) || amountMinorUnits < 50) {

    return NextResponse.json(

      { error: "amountMinorUnits must be an integer of at least 50 (e.g. agorot for ILS)." },

      { status: 400 }

    );

  }



  // המרת הסכום מאגורות לשקלים שלמים עבור ה-API של Hyp

  const amountMainUnits = amountMinorUnits / 100;



  const currency = String(body.currency ?? "ils").toLowerCase();

  if (currency !== "ils") {

    return NextResponse.json({ error: "Hyp integration currently supports ILS only." }, { status: 400 });

  }



  const description = String(body.description ?? "AnyNanny booking payment").slice(0, 500);



  const supabase = await createSupabaseServerClient();

  const {

    data: { user }

  } = await supabase.auth.getUser();

  if (!user) {

    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  }



  const bookingId = String(body.bookingId ?? "").trim();

  if (!bookingId) {

    return NextResponse.json({ error: "bookingId is required." }, { status: 400 });

  }



  const { data: booking, error: bookingErr } = await supabase

    .from("bookings")

    .select("id, parent_id, status, payment_status, paid_at")

    .eq("id", bookingId)

    .maybeSingle();



  if (bookingErr || !booking) {

    return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  }



  const row = booking as {

    id: string;

    parent_id: string;

    status: string;

    payment_status?: string | null;

    paid_at?: string | null;

  };



  if (String(row.parent_id) !== user.id) {

    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  }



  if (!PAYABLE_BOOKING_STATUSES.has(String(row.status))) {

    return NextResponse.json(

      { error: "This booking cannot be paid in its current state." },

      { status: 400 }

    );

  }



  if (row.payment_status === "paid" || row.paid_at) {

    return NextResponse.json({ error: "This booking is already paid." }, { status: 400 });

  }



  let successUrl: string;

  let cancelUrl: string;

  try {

    successUrl = resolveCheckoutRedirectUrl(

      request,

      body.successUrl,

      "/parent/dashboard?checkout=success"

    );

    cancelUrl = resolveCheckoutRedirectUrl(request, body.cancelUrl, "/parent/dashboard?checkout=cancel");

  } catch (e) {

    const message = e instanceof Error ? e.message : "Invalid redirect URL.";

    return NextResponse.json({ error: message }, { status: 400 });

  }



  // שליפת משתני הסביבה של Hyp (Yaad) מתוך ה-process.env

  const yaadTerminal = process.env.HYP_YAAD_TERMINAL || "0000000000"; // מספר מסוף מ-Hyp

  const yaadPassPrit = process.env.HYP_YAAD_KEY || ""; // מפתח החתימה או סיסמת ה-Prit שלכם



  try {

    // בניית מחרוזת הפרמטרים לשליחה ל-API החיצוני של Yaad/Hyp לצורך קבלת טופס מובטח או מעבר ישיר

    const params = new URLSearchParams({

      action: "APIsale",

      Masof: yaadTerminal,

      PassPrit: yaadPassPrit,

      Amount: amountMainUnits.toFixed(2),

      Teldg: description,

      Info: `Booking_${bookingId}`,

      UserId: user.id,

      ClientName: user.user_metadata?.full_name || "AnyNanny Client",

      ClientEmail: user.email || "",

      UTF8: "True",

      // כתובות חזרה לאחר סיום העסקה ב-Hyp

      SendURL: successUrl,

      CancelURL: cancelUrl

    });



    // 🚀 כתובת דף התשלום המובנה של Yaad/Hyp

    const hypPaymentUrl = `https://yaadpay.yaad.net/p/?${params.toString()}`;



    return NextResponse.json({

      url: hypPaymentUrl,

      sessionId: `hyp_${bookingId}_${Date.now()}` // מזהה סשן פנימי זמני לאפליקציה

    });

  } catch (e) {

    const message = e instanceof Error ? e.message : "Hyp Gateway error.";

    return NextResponse.json({ error: message }, { status: 502 });

  }

}

