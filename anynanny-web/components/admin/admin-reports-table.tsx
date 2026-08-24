"use client";

import { useState } from "react";

export type AdminReportListItem = {
  id: string;
  created_at: string;
  reporter_label: string;
  reported_label: string;
  reported_user_id: string;
  target_type: string;
  reason: string;
  details: string | null;
  status: string;
  reported_suspended: boolean;
};

export function AdminReportsTable({ initialReports }: { initialReports: AdminReportListItem[] }) {
  const [reports, setReports] = useState(initialReports);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAction = async (id: string, action: "resolve" | "suspend" | "unsuspend") => {
    setBusyId(id);
    setError(null);
    const response = await fetch(`/api/admin/reports/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    setBusyId(null);
    if (!response.ok) {
      setError(json.error || "Action failed.");
      return;
    }
    setReports((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              status: "resolved",
              reported_suspended: action === "unsuspend" ? false : action === "suspend" ? true : row.reported_suspended
            }
          : row
      )
    );
  };

  if (reports.length === 0) {
    return <p className="text-sm text-navy-700">No reports yet.</p>;
  }

  return (
    <div className="space-y-3">
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-navy-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Reporter</th>
              <th className="px-3 py-2">Reported</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">Details</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 align-top">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">
                  {new Date(row.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2">{row.reporter_label}</td>
                <td className="px-3 py-2">
                  {row.reported_label}
                  {row.reported_suspended ? (
                    <span className="mt-1 block text-[11px] font-semibold text-amber-800">Suspended</span>
                  ) : null}
                </td>
                <td className="px-3 py-2">{row.reason}</td>
                <td className="max-w-[16rem] px-3 py-2 text-xs text-slate-600">{row.details || "—"}</td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      disabled={busyId === row.id || row.status === "resolved"}
                      onClick={() => void runAction(row.id, "resolve")}
                      className="rounded bg-slate-800 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Mark resolved
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void runAction(row.id, "suspend")}
                      className="rounded bg-red-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Suspend
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id || !row.reported_suspended}
                      onClick={() => void runAction(row.id, "unsuspend")}
                      className="rounded bg-emerald-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Unsuspend
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
