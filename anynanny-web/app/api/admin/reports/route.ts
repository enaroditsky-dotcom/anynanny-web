import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import { formatProfileDisplayName } from "@/lib/supabase/profiles";

export const dynamic = "force-dynamic";

type ReportRow = {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  target_type: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

function labelFor(
  id: string,
  profiles: Map<string, { first_name?: string | null; last_name?: string | null; public_id?: string | null }>
): string {
  const profile = profiles.get(id);
  const name = formatProfileDisplayName(profile);
  const publicId = profile?.public_id?.trim();
  if (name && publicId) return `${name} (${publicId})`;
  return name || publicId || id.slice(0, 8);
}

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("user_reports")
      .select(
        "id, reporter_id, reported_user_id, target_type, reason, details, status, created_at, reviewed_at, reviewed_by"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const reports = (data ?? []) as ReportRow[];
    const ids = [
      ...new Set(reports.flatMap((row) => [row.reporter_id, row.reported_user_id]).filter(Boolean))
    ];

    const profiles = new Map<
      string,
      { first_name?: string | null; last_name?: string | null; public_id?: string | null }
    >();
    if (ids.length > 0) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, public_id, suspended_at")
        .in("id", ids);
      for (const row of profileRows ?? []) {
        if (!row || typeof row !== "object" || !("id" in row)) continue;
        profiles.set(String((row as { id: string }).id), row as never);
      }
    }

    return NextResponse.json({
      reports: reports.map((row) => ({
        ...row,
        reporter_label: labelFor(row.reporter_id, profiles),
        reported_label: labelFor(row.reported_user_id, profiles),
        reported_suspended: Boolean(
          (profiles.get(row.reported_user_id) as { suspended_at?: string | null } | undefined)?.suspended_at
        )
      }))
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load reports." },
      { status: 500 }
    );
  }
}
