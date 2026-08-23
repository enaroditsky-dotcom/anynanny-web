"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { fetchOwnBlockList, unblockUser, type BlockedUserRow } from "@/lib/safety/blocks";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function BlockedUsersSection() {
  const { user } = useAuth();
  const [rows, setRows] = useState<BlockedUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await fetchOwnBlockList(supabase, user.id);
    setRows(result.rows);
    setError(result.error);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleUnblock = async (blockedId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user?.id) return;
    setBusyId(blockedId);
    const result = await unblockUser(supabase, user.id, blockedId);
    setBusyId(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setRows((prev) => prev.filter((row) => row.blockedId !== blockedId));
  };

  return (
    <section className="mt-6 rounded-3xl border border-slate-200/60 bg-white p-4 shadow-soft" dir="rtl">
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">משתמשים חסומים</h2>
      {loading ? (
        <p className="mt-3 text-sm text-slate-500">טוען…</p>
      ) : error ? (
        <p className="mt-3 text-sm text-rose-700">{error}</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">אין משתמשים חסומים.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li
              key={row.blockedId}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2"
            >
              <span className="text-sm font-semibold text-slate-700">משתמש חסום</span>
              <button
                type="button"
                disabled={busyId === row.blockedId}
                onClick={() => void handleUnblock(row.blockedId)}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800 disabled:opacity-60"
              >
                {busyId === row.blockedId ? "מבטל…" : "בטל חסימה"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
