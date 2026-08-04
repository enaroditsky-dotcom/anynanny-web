import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { broadcastId } = await request.json();

    if (!broadcastId) {
      return NextResponse.json({ error: "broadcastId is required." }, { status: 400 });
    }

    // Use @supabase/ssr — auth-helpers JSON.parses `base64-...` cookies and crashes.
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });
    }

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
