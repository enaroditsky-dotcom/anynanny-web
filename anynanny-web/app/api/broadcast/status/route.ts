import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Action = "pause" | "fill" | "cancel";

/**
 * Authenticated parent lifecycle transitions for broadcast_alerts.
 * Minimize is intentionally not supported here (UI-only).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: Action;
      alertId?: string;
    };

    const action = body.action;
    const alertId = typeof body.alertId === "string" ? body.alertId.trim() : "";

    if (!action || !["pause", "fill", "cancel"].includes(action)) {
      return NextResponse.json({ error: "action is required." }, { status: 400 });
    }
    if (!alertId || alertId === "null") {
      return NextResponse.json({ error: "alertId is required." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const nextStatus =
      action === "pause" ? "paused" : action === "fill" ? "filled" : "cancelled";
    const requiredStatus =
      action === "pause" || action === "fill" ? "active" : "paused";

    const { data, error } = await supabase
      .from("broadcast_alerts")
      .update({ status: nextStatus })
      .eq("id", alertId)
      .eq("parent_id", user.id)
      .eq("status", requiredStatus)
      .select("id, status")
      .maybeSingle();

    if (error) {
      console.error("[broadcast status]", {
        action,
        alertId,
        parentId: user.id,
        payload: { status: nextStatus },
        error
      });
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        },
        { status: 500 }
      );
    }

    if (!data) {
      console.error("[broadcast status] affected 0 rows", {
        action,
        alertId,
        parentId: user.id,
        requiredStatus,
        nextStatus
      });
      return NextResponse.json(
        {
          error: `${action} affected 0 rows`,
          alertId,
          parentId: user.id,
          requiredStatus,
          nextStatus
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, row: data });
  } catch (error) {
    console.error("[broadcast status] server:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
