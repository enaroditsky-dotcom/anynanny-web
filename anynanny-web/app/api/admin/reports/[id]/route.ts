import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type ActionBody = {
  action?: "resolve" | "suspend" | "unsuspend";
  reason?: string;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const { id } = await context.params;
  const reportId = String(id ?? "").trim();
  if (!reportId) {
    return NextResponse.json({ error: "Missing report id." }, { status: 400 });
  }

  let body: ActionBody = {};
  try {
    body = (await request.json()) as ActionBody;
  } catch {
    body = {};
  }

  const action = body.action;
  if (action !== "resolve" && action !== "suspend" && action !== "unsuspend") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data: report, error: reportError } = await supabase
      .from("user_reports")
      .select("id, reported_user_id, status")
      .eq("id", reportId)
      .maybeSingle();

    if (reportError || !report) {
      return NextResponse.json({ error: reportError?.message ?? "Report not found." }, { status: 404 });
    }

    const reportedUserId = String((report as { reported_user_id: string }).reported_user_id);

    if (action === "suspend" || action === "unsuspend") {
      const patch =
        action === "suspend"
          ? {
              suspended_at: new Date().toISOString(),
              suspended_reason: (body.reason ?? "admin_report").trim() || "admin_report"
            }
          : { suspended_at: null, suspended_reason: null };

      const { error: profileError } = await supabase.from("profiles").update(patch).eq("id", reportedUserId);
      if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 500 });
      }
    }

    const { error: resolveError } = await supabase
      .from("user_reports")
      .update({
        status: "resolved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: "admin"
      })
      .eq("id", reportId);

    if (resolveError) {
      return NextResponse.json({ error: resolveError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Action failed." },
      { status: 500 }
    );
  }
}
