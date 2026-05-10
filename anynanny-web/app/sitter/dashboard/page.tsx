"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  HOURLY_RATE,
  SESSIONS_TABLE,
  type SupabaseSessionRow,
  formatElapsed
} from "@/lib/session/protocol";

const SESSION_CIRCLE_STYLE: CSSProperties = {
  width: 220,
  height: 220,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center"
};

function rowMatchesPendingForSitter(row: SupabaseSessionRow, sitterId: string): boolean {
  if (row.status !== "pending") return false;
  if (row.sitter_id && row.sitter_id !== sitterId) return false;
  return true;
}

function rowMatchesEndConfirm(row: SupabaseSessionRow, sitterId: string): boolean {
  return (
    row.status === "active" &&
    Boolean(row.end_requested) &&
    !row.end_confirmed &&
    row.sitter_id === sitterId
  );
}

function pickLatestMatching(rows: SupabaseSessionRow[], sitterId: string) {
  let pending: SupabaseSessionRow | null = null;
  let endConfirm: SupabaseSessionRow | null = null;
  for (const row of rows) {
    if (!pending && rowMatchesPendingForSitter(row, sitterId)) pending = row;
    if (!endConfirm && rowMatchesEndConfirm(row, sitterId)) endConfirm = row;
    if (pending && endConfirm) break;
  }
  return { pending, endConfirm };
}

export default function SitterDashboardPage() {
  const [sitterId, setSitterId] = useState<string | null>(null);
  const [pendingRow, setPendingRow] = useState<SupabaseSessionRow | null>(null);
  const [endConfirmRow, setEndConfirmRow] = useState<SupabaseSessionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  const refreshForUser = useCallback(async (supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>, uid: string) => {
    const { data: rows, error } = await supabase
      .from(SESSIONS_TABLE)
      .select("*")
      .in("status", ["pending", "active"])
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) {
      console.warn("[sitter dashboard] refresh:", error.message);
      return;
    }
    const list = (rows ?? []) as SupabaseSessionRow[];
    const { pending, endConfirm } = pickLatestMatching(list, uid);
    setPendingRow(pending);
    setEndConfirmRow(endConfirm);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      setBanner("Supabase לא מוגדר.");
      return;
    }

    let cancelled = false;
    let channelCleanup: (() => void) | null = null;

    void (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id ?? null;
      if (!uid) {
        if (!cancelled) {
          setLoading(false);
          setBanner("יש להתחבר כדי לראות משמרות.");
        }
        return;
      }
      if (cancelled) return;
      setSitterId(uid);
      await refreshForUser(supabase, uid);
      if (cancelled) return;
      setLoading(false);

      const channel = supabase.channel(`sitter-dashboard-${uid}`);
      channel.on("postgres_changes", { event: "*", schema: "public", table: SESSIONS_TABLE }, () => {
        void refreshForUser(supabase, uid);
      });
      channel.subscribe();
      channelCleanup = () => {
        void supabase.removeChannel(channel);
      };
    })();

    return () => {
      cancelled = true;
      if (channelCleanup) channelCleanup();
    };
  }, [refreshForUser]);

  const liveElapsed = useMemo(() => {
    const row = endConfirmRow ?? pendingRow;
    if (!row?.start_time || row.status === "pending") return 0;
    const startMs = new Date(row.start_time).getTime();
    const endWall =
      row.end_requested && row.parent_end_requested_at
        ? new Date(row.parent_end_requested_at).getTime()
        : Date.now();
    return Math.max(0, Math.floor((endWall - startMs) / 1000));
  }, [pendingRow, endConfirmRow]);

  const liveTimerText = useMemo(() => formatElapsed(liveElapsed), [liveElapsed]);
  const liveEarned = useMemo(() => ((liveElapsed / 3600) * HOURLY_RATE).toFixed(2), [liveElapsed]);

  const confirmStartShift = async () => {
    if (!pendingRow || !sitterId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const startIso = new Date().toISOString();
    const { error } = await supabase
      .from(SESSIONS_TABLE)
      .update({
        status: "active",
        sitter_id: sitterId,
        start_time: startIso
      })
      .eq("id", pendingRow.id);
    if (error) {
      window.alert(`לא ניתן לאשר משמרת: ${error.message}`);
      return;
    }
    await refreshForUser(supabase, sitterId);
  };

  const confirmEndShift = async () => {
    if (!endConfirmRow?.start_time || !sitterId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const endIso = new Date().toISOString();
    const startMs = new Date(endConfirmRow.start_time).getTime();
    const endMs = new Date(endIso).getTime();
    const finalSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
    const { error } = await supabase
      .from(SESSIONS_TABLE)
      .update({
        status: "completed",
        end_time: endIso,
        end_requested: false,
        end_confirmed: true,
        parent_end_requested_at: null,
        final_elapsed_seconds: finalSeconds,
        final_amount_nis: Number(((finalSeconds / 3600) * HOURLY_RATE).toFixed(2))
      })
      .eq("id", endConfirmRow.id);
    if (error) {
      window.alert(`לא ניתן לאשר סיום: ${error.message}`);
      return;
    }
    await refreshForUser(supabase, sitterId);
  };

  if (loading) {
    return (
      <main className="mx-auto flex min-h-[40vh] w-full max-w-md items-center justify-center bg-[#FDFBF6] py-10" dir="rtl">
        <p className="text-right text-sm text-slate-600">טוען…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-md flex-col bg-[#FDFBF6] py-4" dir="rtl">
      <header className="px-2 text-right">
        <h1 className="text-xl font-bold text-[#001F3F]">לוח בייביסיטר</h1>
        <p className="mt-1 text-sm text-slate-600">אישור Double-Shake — לחצי על העיגול הירוק.</p>
      </header>

      {banner ? (
        <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-right text-sm text-amber-900">{banner}</p>
      ) : null}

      <div className="mt-4 flex flex-1 flex-col px-2">
        {endConfirmRow ? (
          <section className="flex min-h-0 flex-1 flex-col rounded-3xl border border-[#001F3F]/20 bg-white p-5 shadow-soft">
            <div className="text-right">
              <p className="text-sm font-semibold text-[#001F3F]">ההורה ביקש לסיים את המשמרת</p>
              <p className="mt-3 text-3xl font-bold tabular-nums text-navy-header">{liveTimerText}</p>
              <p className="text-sm font-semibold text-navy-800">סכום מצטבר (עד הבקשה): ₪{liveEarned}</p>
            </div>
            <div className="mt-auto flex justify-center pt-10 pb-6">
              <button
                type="button"
                style={SESSION_CIRCLE_STYLE}
                onClick={() => void confirmEndShift()}
                className="flex-col gap-2 bg-emerald-600 px-4 text-center text-[15px] font-bold leading-snug text-white shadow-[0_12px_32px_-10px_rgba(5,150,105,0.55)] ring-2 ring-emerald-700/25 transition hover:brightness-105 active:brightness-95"
              >
                <span className="max-w-[11rem]">אישור סיום</span>
                <span className="max-w-[11rem] text-xs font-semibold opacity-95">ונעילת תשלום</span>
              </button>
            </div>
          </section>
        ) : pendingRow ? (
          <section className="flex min-h-0 flex-1 flex-col rounded-3xl border border-emerald-200 bg-white p-5 shadow-soft">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-700">משמרת חדשה ממתינה לאישור</p>
              <p className="mt-1 text-xs text-slate-500">מזהה סשן: {String(pendingRow.id).slice(0, 8)}…</p>
            </div>
            <div className="mt-auto flex justify-center pt-10 pb-6">
              <button
                type="button"
                style={SESSION_CIRCLE_STYLE}
                onClick={() => void confirmStartShift()}
                className="flex-col gap-2 bg-emerald-600 px-4 text-center text-[15px] font-bold leading-snug text-white shadow-[0_12px_32px_-10px_rgba(5,150,105,0.55)] ring-2 ring-emerald-700/25 animate-session-pulse-green transition hover:brightness-105 active:brightness-95"
              >
                <span className="max-w-[11rem]">אישור התחלת משמרת</span>
              </button>
            </div>
          </section>
        ) : (
          <section className="flex flex-1 flex-col justify-center rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-slate-600">אין בקשות פתיחה כרגע.</p>
            <p className="mt-2 text-xs text-slate-500">החליפו ל&quot;הורה&quot; כדי לפתוח משמרת, ואז חזרו לכאן.</p>
          </section>
        )}
      </div>
    </main>
  );
}
