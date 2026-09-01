import { saveOwnContactPhone } from "@/lib/profile/own-contact-phone-server";
import { createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const supabase = await createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "שמירת מספר הטלפון נכשלה." }, { status: 500 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר." }, { status: 401 });
  }

  let body: { phone?: unknown } = {};
  try {
    body = (await request.json()) as { phone?: unknown };
  } catch {
    return NextResponse.json({ error: "יש להזין מספר טלפון תקין" }, { status: 400 });
  }

  const result = await saveOwnContactPhone(supabase, {
    actorId: user.id,
    phone: String(body.phone ?? "")
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, reason: result.reason }, { status: result.status });
  }

  return NextResponse.json({ phone: result.phone });
}
