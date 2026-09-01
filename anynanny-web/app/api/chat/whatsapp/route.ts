import { loadAuthorizedWhatsAppAvailability, loadAuthorizedWhatsAppHandoffUrl } from "@/lib/chat/whatsapp-handoff-server";
import { parseWhatsAppBookingId } from "@/lib/chat/whatsapp-handoff";
import { createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireUser() {
  const supabase = await createServerClient();
  if (!supabase) {
    return { error: NextResponse.json({ error: "לא ניתן לפתוח WhatsApp כרגע." }, { status: 500 }) };
  }
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "יש להתחבר." }, { status: 401 }) };
  }
  return { supabase, user };
}

export async function GET(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const bookingId = parseWhatsAppBookingId(new URL(request.url).searchParams.get("bookingId"));
  if (!bookingId) {
    return NextResponse.json({ error: "חסר מזהה הזמנה." }, { status: 400 });
  }

  const result = await loadAuthorizedWhatsAppAvailability(auth.supabase, {
    actorId: auth.user.id,
    bookingId
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, reason: result.reason }, { status: result.status });
  }

  return NextResponse.json({
    eligible: result.eligible,
    counterpartHasPhone: result.counterpartHasPhone
  });
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "לא ניתן לפתוח WhatsApp כרגע." }, { status: 500 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר." }, { status: 401 });
  }

  let body: { bookingId?: unknown } = {};
  try {
    body = (await request.json()) as { bookingId?: unknown };
  } catch {
    return NextResponse.json({ error: "חסר מזהה הזמנה." }, { status: 400 });
  }

  const bookingId = parseWhatsAppBookingId(String(body.bookingId ?? ""));
  if (!bookingId) {
    return NextResponse.json({ error: "חסר מזהה הזמנה." }, { status: 400 });
  }

  const result = await loadAuthorizedWhatsAppHandoffUrl(supabase, {
    actorId: user.id,
    bookingId
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, reason: result.reason }, { status: result.status });
  }

  return NextResponse.json({ url: result.url });
}
