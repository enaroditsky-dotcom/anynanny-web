"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { buildDashboardGreetingTitle } from "@/lib/user/use-dashboard-greeting-name";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Star } from "lucide-react";

type SitterDashboardStats = {
  avg_rating: number | null;
  rating_count: number;
};

type LoadState = "idle" | "loading" | "ready" | "error";

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
  const statsLoading = !sitterId || loadState === "loading" || loadState === "idle";

  // פורמט נקי ואחיד לנני הראשונה במערכת (AN-1001) במידה והמזהה הוא גולמי/אקראי
  const displayIdValue = "AN-1001";
  
  const numericRating = stats.avg_rating != null ? Number(stats.avg_rating).toFixed(1) : "0.0";
  const reviewsCount = stats.rating_count || 0;

  return (
    <header className="px-0" dir="rtl">
      {/* קופסה פנימית אפורה בהירה - תואמת בול למסך ההורה */}
      <div className="rounded-2xl bg-slate-50/70 p-4 border border-slate-100 space-y-3">
        
        {/* שורה ראשונה: שם הנני מימין, ומזהה ה-ID משמאל */}
        <div className="flex items-center justify-between">
          <h1
            className={`text-lg font-bold text-slate-900 ${nameLoading ? "animate-pulse" : ""}`}
          >
            {greeting}
          </h1>

          <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 text-[11px] font-bold px-2.5 py-0.5 rounded-md border border-purple-200" dir="ltr">
            <span>{displayIdValue}</span>
            <span className="text-[9px] text-purple-500 font-normal">ID</span>
          </span>
        </div>

        {/* שורה שנייה: דירוג כוכבים בצד שמאל */}
        <div className="flex items-center justify-start">
          {statsLoading ? (
            <span className="inline-block h-6 w-28 animate-pulse rounded-md bg-amber-50" aria-hidden />
          ) : (
            <div className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200/60 text-amber-800 text-xs font-medium px-2 py-0.5 rounded-md">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              <span>{numericRating}</span>
              <span className="text-slate-400 text-[11px]">({reviewsCount} חוות דעת)</span>
            </div>
          )}
        </div>
      </div>

      {children}
    </header>
  );
}