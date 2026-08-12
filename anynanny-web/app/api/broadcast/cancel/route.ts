import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Legacy cancel endpoint — prefers paused→cancelled via /api/broadcast/status.
 * Kept for older callers; still ownership-guarded.
 */
export async function POST(request: Request) {
  try {
    const { broadcastId } = await request.json();

    if (!broadcastId) {
      return NextResponse.json({ error: "broadcastId is required." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("broadcast_alerts")
      .update({ status: "cancelled" })
      .eq("id", broadcastId)
      .eq("parent_id", user.id)
      .eq("status", "paused")
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("Supabase cancel error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: "cancel affected 0 rows" },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Server error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
