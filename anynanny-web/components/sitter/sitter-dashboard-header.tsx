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
import { Star, User } from "lucide-react";
import { IdentityStatusIndicator } from "@/components/identity/identity-status-indicator";

type SitterDashboardStats = {
  avg_rating: number | null;
  rating_count: number;
};

type LoadState = "idle" | "loading" | "ready" | "error";

const GET_CURRENT_USER_RATING_RPC = "get_current_user_rating";

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
  avatarUrl?: string | null;
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
  avatarUrl = null,
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
      if (!isRpcKnownMissing(GET_CURRENT_USER_RATING_RPC)) {
        const { data, error } = await supabase.rpc(GET_CURRENT_USER_RATING_RPC);
        if (cancelled) return;

        if (!error) {
          const { avg_rating, rating_count } = parseGetCurrentUserRatingResponse(data);
          setStats({ avg_rating, rating_count });
          setLoadState("ready");
          return;
        }

        if (isMissingRpcError(error)) {
          markRpcMissing(GET_CURRENT_USER_RATING_RPC);
        }
      }

      const { data: rows, error: ratingsErr } = await supabase
        .from(RATINGS_TABLE)
        .select("rating")
        .eq("to_user_id", sitterId)
        .not("published_at", "is", null);
      if (cancelled) return;
      if (ratingsErr) {
        if (/published_at|schema cache|column/i.test(ratingsErr.message ?? "")) {
          const legacy = await supabase
            .from(RATINGS_TABLE)
            .select("rating")
            .eq("to_user_id", sitterId);
          if (cancelled) return;
          if (legacy.error) {
            setLoadState("error");
            return;
          }
          const ratings = (legacy.data ?? [])
            .map((r) => Number((r as { rating?: unknown }).rating))
            .filter((n) => Number.isFinite(n));
          const rating_count = ratings.length;
          const avg_rating =
            rating_count > 0 ? ratings.reduce((a, b) => a + b, 0) / rating_count : null;
          setStats({ avg_rating, rating_count });
          setLoadState("ready");
          return;
        }
        setLoadState("error");
        return;
      }
      const ratings = (rows ?? [])
        .map((r) => Number((r as { rating?: unknown }).rating))
        .filter((n) => Number.isFinite(n));
      const rating_count = ratings.length;
      const avg_rating =
        rating_count > 0 ? ratings.reduce((a, b) => a + b, 0) / rating_count : null;
      setStats({ avg_rating, rating_count });
      setLoadState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [sitterId, refreshKey]);

  const greeting = buildDashboardGreetingTitle(firstName, nameLoading);
  const statsLoading = !sitterId || loadState === "loading" || loadState === "idle";
  const displayIdValue = (publicDisplayId ?? "").trim() || null;
  const showIdPill = showPublicId && (publicIdLoaded ? Boolean(displayIdValue) : Boolean(displayIdValue));
  const numericRating = stats.avg_rating != null ? Number(stats.avg_rating).toFixed(1) : "0.0";
  const reviewsCount = stats.rating_count || 0;

  return (
    <header className="px-0" dir="rtl">
      <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm">
              {avatarUrl ? (
                <img src={avatarUrl} alt="תמונת פרופיל" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <User className="h-6 w-6" />
                </div>
              )}
            </div>
            <h1 className={`min-w-0 text-lg font-bold leading-snug text-slate-900 ${nameLoading ? "animate-pulse" : ""}`}>
              {greeting}
            </h1>
          </div>
          {showIdPill && displayIdValue ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-purple-200 bg-purple-100 px-2.5 py-0.5 text-[13px] font-bold text-purple-800"
              dir="ltr"
            >
              <span>{displayIdValue}</span>
              <span className="text-[11px] font-normal text-purple-500">ID</span>
            </span>
          ) : showPublicId && !publicIdLoaded ? (
            <span className="inline-block h-5 w-16 shrink-0 animate-pulse rounded-md bg-purple-100/80" aria-hidden />
          ) : null}
        </div>
        <div className="flex items-start justify-between gap-3">
          {statsLoading ? (
            <span className="inline-block h-6 w-28 animate-pulse rounded-md bg-amber-50" aria-hidden />
          ) : (
            <div className="inline-flex min-w-0 items-center gap-1 rounded-md border border-amber-200/60 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
              <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
              <span>{numericRating}</span>
              <span className="text-[13px] text-slate-400">({reviewsCount} חוות דעת)</span>
            </div>
          )}
          <div className="flex min-w-0 max-w-[11.5rem] shrink-0 justify-end sm:max-w-[13rem]">
            <IdentityStatusIndicator
              userId={sitterId}
              role="sitter"
              nextPath="/sitter/dashboard"
            />
          </div>
        </div>
      </div>
      {children}
    </header>
  );
}