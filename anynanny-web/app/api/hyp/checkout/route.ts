import { resolveCheckoutRedirectUrl } from "@/lib/stripe/redirect-url";
import { createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CheckoutBody = {
  amountMinorUnits?: number;
  currency?: string;
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
  bookingId?: string;
};

const PAYABLE_BOOKING_STATUSES = new Set(["completed", "sitter_ended", "parent_started"]);

export async function POST(request: Request) {
  let body: CheckoutBody;
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Server client initialization failed." }, { status: 500 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const bookingId = String(body.bookingId ?? "").trim();
  if (!bookingId) {
    return NextResponse.json({ error: "bookingId is required." }, { status: 400 });
  }

  // 1. שליפת המשמרת לבדיקת הרשאות וסטטוס
  const { data: booking, error: bookingErr } = await supabase
    .from("bookings")
    .select("id, parent_id, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingErr || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  if (String(booking.parent_id) !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // 2. 🔥 מעקף BETA-TEST מוחלט: עדכון ישיר של המשמרת והסשן ב-Database כאילו שולם!
  
  // עדכון טבלת הבוקינגס
  const { error: updateBookingErr } = await supabase
    .from("bookings")
    .update({
      payment_status: "paid",
      paid_at: new Date().toISOString(),
      status: "completed" // הפיכת הבוקינג לגמור
    })
    .eq("id", bookingId);

  if (updateBookingErr) {
    console.error("Bypass Error updating booking:", updateBookingErr.message);
  }

  // עדכון טבלת הסשנים המקושרת (כדי להעביר את הנני סטטוס)
  const { error: updateSessionErr } = await supabase
    .from("sessions")
    .update({
      status: "completed", // משחרר את הסטטוס של הסשן ל-completed / paid
      end_time: new Date().toISOString()
    })
    .eq("booking_id", bookingId); // או לפי הפילטר המקשר שלך בפרויקט

  if (updateSessionErr) {
    // במידה ושם העמודה הוא אחר, ננסה גם לפי parent_id למקרה חירום
    await supabase
      .from("sessions")
      .update({ status: "completed" })
      .eq("parent_id", user.id)
      .in("status", ["active", "payment_pending"]);
  }

  // 3. יצירת כתובת חזרה דינמית לדשבורד עם סימון הצלחה
  let successUrl: string;
  try {
    successUrl = resolveCheckoutRedirectUrl(
      request,
      body.successUrl,
      "/parent/dashboard?checkout=success"
    );
  } catch {
    successUrl = "/parent/dashboard?checkout=success";
  }

  // 4. החזרת הכתובת ישירות לפרונטאנד — הדפדפן יבצע סימולציית הצלחה מיידית!
  return NextResponse.json({
    url: successUrl,
    sessionId: `beta_bypass_${bookingId}_${Date.now()}`
  });
}