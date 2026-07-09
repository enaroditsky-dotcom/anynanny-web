"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { buildDashboardGreetingTitle } from "@/lib/user/use-dashboard-greeting-name";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type SitterDashboardStats = {
  avg_rating: number | null;
  rating_count: number;
};

type LoadState = "idle" | "loading" | "ready" | "error";

const idBadgeClass =
  "inline-flex items-center gap-1 bg-purple-50 text-purple-700 text-xs font-semibold px-2.5 py-1 rounded-lg border border-purple-100 shadow-sm";

const ratingBadgeClass =
  "inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50/95 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-amber-950 ring-1 ring-amber-200/80 sm:text-xs";

function parseGetCurrentUserRatingResponse(data: unknown): SitterDashboardStats {
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row || typeof row !== "object") {
    return { avg_rating: null, rating_count: 0 };
  }

  const avgRaw = row.avg_rating ?? row.avgRating;
  const avg_rating =
    avgRaw == null || avgRaw === ""
      ? null
      : Number.isFinite(Number(avgRaw))
        ? Number(avgRaw)
        : null;

  const countRaw = row.rating_count ?? row.ratingCount;
  const rating_count = Number.isFinite(Number(countRaw)) ? Math.max(0, Math.floor(Number(countRaw))) : 0;

  return { avg_rating, rating_count };
}

type SitterDashboardHeaderProps = {
  firstName?: string | null;
  nameLoading?: boolean;
  sitterId: string | null;
  refreshKey?: number;
  showPublicId?: boolean;
  /** From profiles.public_id (e.g. AN_1001). */
  publicDisplayId?: string | null;
  publicIdLoaded?: boolean;
  children?: ReactNode;
};

export function SitterDashboardHeader({
  firstName = null,
  nameLoading = false,
  sitterId,
  refreshKey = 0,
  showPublicId = false,
  publicDisplayId = null,
  publicIdLoaded = false,
  children
}: SitterDashboardHeaderProps) {
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [stats, setStats] = useState<SitterDashboardStats>({
    avg_rating: null,
    rating_count: 0
  });

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
      const { data, error } = await supabase.rpc("get_current_user_rating");
      if (cancelled) return;

      if (error) {
        console.warn("[SitterDashboardHeader] get_current_user_rating:", error.message);
        setLoadState("error");
        return;
      }

      const { avg_rating, rating_count } = parseGetCurrentUserRatingResponse(data);
      setStats({ avg_rating, rating_count });
      setLoadState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [sitterId, refreshKey]);

  const greeting = buildDashboardGreetingTitle(firstName, nameLoading);

  const ratingLabel = `⭐ ${
    stats.avg_rating != null ? Number(stats.avg_rating).toFixed(1) : "אין דירוג"
  } (${stats.rating_count || 0} חוות דעת)`;

  const statsLoading = !sitterId || loadState === "loading" || loadState === "idle";
  const showIdBadge = showPublicId && !!publicDisplayId;
  const showIdSkeleton = showPublicId && publicIdLoaded && !publicDisplayId;

  return (
    <header className="text-right px-4" dir="rtl">
      <div className="flex flex-wrap items-baseline justify-start gap-x-2 gap-y-1">
        <h1
          className={`text-xl font-bold leading-snug text-[#001F3F] sm:text-[1.35rem] ${nameLoading ? "animate-pulse" : ""}`}
        >
          {greeting}
        </h1>
        {showIdSkeleton ? (
          <span className="inline-block h-6 w-24 animate-pulse rounded-lg bg-slate-100" aria-hidden />
        ) : showIdBadge ? (
          <span className={idBadgeClass} title="מזהה ציבורי">
            <span className="rounded bg-purple-200 px-1 text-[10px] font-bold uppercase text-purple-800">ID</span>
            {publicDisplayId}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-col items-start gap-1.5">
        {statsLoading ? (
          <span className="inline-block h-7 w-36 animate-pulse rounded-full bg-amber-50/80" aria-hidden />
        ) : (
          <span className={ratingBadgeClass} title={ratingLabel}>
            {ratingLabel}
          </span>
        )}
      </div>

      {children}
    </header>
  );
}
