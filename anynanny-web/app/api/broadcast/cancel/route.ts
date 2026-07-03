import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  try {
    const { broadcastId } = await request.json();

    if (!broadcastId) {
      return NextResponse.json({ error: "broadcastId is required." }, { status: 400 });
    }

    // שימוש בקליינט הבטוח של ה-Cookies של Next.js כדי למנוע בעיות של Service Role מקומי
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    // 🔥 עדכון הסטטוס בטבלה הנכונה מתוכה הראדאר מאזין: broadcast_alerts
    const { error } = await supabase
      .from("broadcast_alerts")
      .update({ status: "cancelled" })
      .eq("id", broadcastId);

    if (error) {
      console.error("Supabase cancel error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Server error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}