"use client";

import { Flag, Ban } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ReportUserSheet } from "@/components/safety/report-user-sheet";
import { blockUser, fetchHasBlockedUser, unblockUser } from "@/lib/safety/blocks";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  targetUserId: string;
  targetName?: string | null;
  className?: string;
};

export function UserSafetyActions({ targetUserId, targetName, className = "" }: Props) {
  const { user } = useAuth();
  const [reportOpen, setReportOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBlocked = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user?.id || user.id === targetUserId) return;
    setBlocked(await fetchHasBlockedUser(supabase, user.id, targetUserId));
  }, [targetUserId, user?.id]);

  useEffect(() => {
    void loadBlocked();
  }, [loadBlocked]);

  if (!user?.id || user.id === targetUserId) return null;

  const handleBlockToggle = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const result = blocked
      ? await unblockUser(supabase, user.id, targetUserId)
      : await blockUser(supabase, user.id, targetUserId);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setBlocked(!blocked);
  };

  return (
    <div className={`space-y-2 ${className}`} dir="rtl">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
        >
          <Flag className="h-3.5 w-3.5" aria-hidden />
          דיווח
        </button>
        <button
          type="button"
          onClick={() => void handleBlockToggle()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
        >
          <Ban className="h-3.5 w-3.5" aria-hidden />
          {blocked ? "בטל חסימה" : "חסום"}
        </button>
      </div>
      {error ? (
        <p className="text-xs text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
      <ReportUserSheet
        open={reportOpen}
        reportedUserId={targetUserId}
        reportedName={targetName}
        onClose={() => setReportOpen(false)}
      />
    </div>
  );
}
