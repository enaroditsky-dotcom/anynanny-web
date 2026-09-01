import { loadAuthorizedWhatsAppHandoffUrl } from "@/lib/chat/whatsapp-handoff-server";
import { parseWhatsAppBookingId } from "@/lib/chat/whatsapp-handoff";
import { createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
