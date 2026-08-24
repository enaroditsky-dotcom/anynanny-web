import { AdminReportsTable, type AdminReportListItem } from "@/components/admin/admin-reports-table";
import { requireAdminPage } from "@/lib/admin/require-admin";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import { formatProfileDisplayName } from "@/lib/supabase/profiles";

export const dynamic = "force-dynamic";

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

export default async function AdminReportsPage() {
  await requireAdminPage();

  let reports: AdminReportListItem[] = [];
  let loadError: string | null = null;

  try {
    const supabase = getSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from("user_reports")
      .select(
        "id, reporter_id, reported_user_id, target_type, reason, details, status, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      loadError = error.message;
    } else {
      const rows = data ?? [];
      const ids = [
        ...new Set(rows.flatMap((row) => [String(row.reporter_id), String(row.reported_user_id)]))
      ];
      const profiles = new Map<
        string,
        { first_name?: string | null; last_name?: string | null; public_id?: string | null; suspended_at?: string | null }
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
      reports = rows.map((row) => {
        const reportedId = String(row.reported_user_id);
        return {
          id: String(row.id),
          created_at: String(row.created_at),
          reporter_label: labelFor(String(row.reporter_id), profiles),
          reported_label: labelFor(reportedId, profiles),
          reported_user_id: reportedId,
          target_type: String(row.target_type ?? "user"),
          reason: String(row.reason),
          details: row.details != null ? String(row.details) : null,
          status: String(row.status),
          reported_suspended: Boolean(profiles.get(reportedId)?.suspended_at)
        };
      });
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Failed to load reports.";
  }

  return (
    <main className="mx-auto max-w-5xl p-6 md:py-16">
      <h1 className="mb-2 text-2xl font-semibold text-navy-900">User reports</h1>
      <p className="mb-6 text-sm text-navy-700">
        Review in-app reports, mark them resolved, and suspend or unsuspend the reported account.
      </p>
      {loadError ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {loadError}
        </p>
      ) : (
        <AdminReportsTable initialReports={reports} />
      )}
    </main>
  );
}
