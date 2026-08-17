"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { buildDashboardGreetingTitle } from "@/lib/user/use-dashboard-greeting-name";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { RATINGS_TABLE } from "@/lib/ratings/constants";
import {
  isMissingRpcError,
  isRpcKnownMissing,
  markRpcMissing
} from "@/lib/supabase/rpc-availability";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";

type SitterDashboardStats = {
  nanny_id_number: string | null;
  avg_rating: number | null;
  rating_count: number;
};

type LoadState = "idle" | "loading" | "ready" | "error";

const idBadgeClass =
  "inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100/95 px-2.5 py-1 text-[13px] font-semibold text-slate-800 ring-1 ring-slate-200/90 sm:text-xs";

const ratingBadgeClass =
  "inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50/95 px-2.5 py-1 text-[13px] font-semibold tabular-nums text-amber-950 ring-1 ring-amber-200/80 sm:text-xs";

function parseGetCurrentUserRatingResponse(data: unknown): SitterDashboardStats {
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row || typeof row !== "object") {
    return { nanny_id_number: null, avg_rating: null, rating_count: 0 };
  }

  const nannyRaw = row.nanny_id_number ?? row.nannyIdNumber ?? row.nanny_serial ?? row.nannySerial;
  const nannyTrimmed = typeof nannyRaw === "string" ? nannyRaw.trim() : "";
  const nanny_id_number = nannyTrimmed.length > 0 ? nannyTrimmed : null;

  const avgRaw = row.avg_rating ?? row.avgRating;
  const avg_rating =
    avgRaw == null || avgRaw === ""
      ? null
      : Number.isFinite(Number(avgRaw))
        ? Number(avgRaw)
        : null;

  const countRaw = row.rating_count ?? row.ratingCount;
  const rating_count = Number.isFinite(Number(countRaw)) ? Math.max(0, Math.floor(Number(countRaw))) : 0;

  return { nanny_id_number, avg_rating, rating_count };
}

type SitterDashboardHeaderProps = {
  fullName?: string | null;
  nameLoading?: boolean;
  sitterId: string | null;
  refreshKey?: number;
  showNannyId?: boolean;
  children?: ReactNode;
};

export function SitterDashboardHeader({
  fullName = null,
  nameLoading = false,
  sitterId,
  refreshKey = 0,
  showNannyId = false,
  children
}: SitterDashboardHeaderProps) {
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [stats, setStats] = useState<SitterDashboardStats>({
    nanny_id_number: null,
    avg_rating: null,
    rating_count: 0
  });

  // State עבור התראת תשלום
  const [showNotification, setShowNotification] = useState(false);

  // useEffect לדירוגים (קיים)
  useEffect(() => {
    if (!sitterId) {
      setLoadState("idle");
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadState("error");
      return;
    }

    setLoadState("loading");

    void (async () => {
      const rpcName = "get_current_user_rating";
      if (!isRpcKnownMissing(rpcName)) {
        const { data, error } = await supabase.rpc(rpcName);
        if (cancelled) return;

        if (!error) {
          const { nanny_id_number, avg_rating, rating_count } = parseGetCurrentUserRatingResponse(data);
          setStats({ nanny_id_number, avg_rating, rating_count });
          setLoadState("ready");
          return;
        }

        if (isMissingRpcError(error)) {
          markRpcMissing(rpcName);
        } else {
          console.warn("[SitterEarningsNotification] get_current_user_rating:", error.message);
        }
      }

      // Soft fallback — rating aggregate without the missing RPC.
      let { data: rows, error: ratingsErr } = await supabase
        .from(RATINGS_TABLE)
        .select("rating")
        .eq("to_user_id", sitterId)
        .not("published_at", "is", null);
      if (cancelled) return;
      if (ratingsErr && /published_at|schema cache|column/i.test(ratingsErr.message ?? "")) {
        const legacy = await supabase
          .from(RATINGS_TABLE)
          .select("rating")
          .eq("to_user_id", sitterId);
        rows = legacy.data;
        ratingsErr = legacy.error;
      }
      if (cancelled) return;
      if (ratingsErr) {
        setLoadState("error");
        return;
      }
      const ratings = (rows ?? [])
        .map((r) => Number((r as { rating?: unknown }).rating))
        .filter((n) => Number.isFinite(n));
      const rating_count = ratings.length;
      const avg_rating =
        rating_count > 0 ? ratings.reduce((a, b) => a + b, 0) / rating_count : null;
      setStats({ nanny_id_number: null, avg_rating, rating_count });
      setLoadState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [sitterId, refreshKey]);

  // useEffect להתראת תשלום (חדש - משולב)
  useEffect(() => {
    if (!sitterId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = subscribePostgresChanges(supabase, `realtime-sitter-earnings-${sitterId}`, {
      event: 'UPDATE',
      table: 'sessions',
      filter: `sitter_id=eq.${sitterId}`,
      handler: (payload) => {
        const next = payload.new as { status?: string };
        if (next.status === 'completed') {
          setShowNotification(true);
          setTimeout(() => setShowNotification(false), 10000);
        }
      }
    });

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [sitterId]);

  const greeting = buildDashboardGreetingTitle(fullName, nameLoading);
  const idLabel = stats.nanny_id_number ? `🆔 מזהה: ${stats.nanny_id_number}` : "";
  const ratingLabel = `⭐ ${
    stats.avg_rating != null ? Number(stats.avg_rating).toFixed(1) : "אין דירוג"
  } (${stats.rating_count || 0} חוות דעת)`;

  const statsLoading = !sitterId || loadState === "loading" || loadState === "idle";
  const showIdBadge = showNannyId && !statsLoading && !!stats.nanny_id_number;
  const showIdSkeleton = showNannyId && statsLoading;

  return (
    <header className="text-right" dir="rtl">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <h1
          className={`text-xl font-bold leading-snug text-[#001F3F] sm:text-[1.35rem] ${nameLoading ? "animate-pulse" : ""}`}
        >
          {greeting}
        </h1>

        {showIdSkeleton ? (
          <span className="inline-block h-7 w-28 animate-pulse rounded-full bg-slate-100" aria-hidden />
        ) : showIdBadge ? (
          <span className={idBadgeClass} title={idLabel}>
            {idLabel}
          </span>
        ) : null}

        {statsLoading ? (
          <span className="inline-block h-7 w-36 animate-pulse rounded-full bg-amber-50/80" aria-hidden />
        ) : (
          <span className={ratingBadgeClass} title={ratingLabel}>
            {ratingLabel}
          </span>
        )}
      </div>

      <p className="mt-1 text-sm font-medium text-slate-600">מה תרצה לעשות היום?</p>
      {children}

      {/* התראת תשלום צפה */}
      {showNotification && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-lg">
          <p className="text-sm font-bold text-emerald-900">🎉 תשלום חדש התקבל!</p>
          <p className="text-xs text-emerald-700">משמרת הסתיימה והכסף בדרך לארנק שלך.</p>
        </div>
      )}
    </header>
  );
}