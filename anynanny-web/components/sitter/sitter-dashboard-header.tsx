"use client";

import { useEffect, useState, type ReactNode } from "react";
import { IdCard, Star } from "lucide-react";
import { ParentProfileCardHelp } from "@/components/parent/parent-profile-card-help";
import { SitterDashboardAvatar } from "@/components/sitter/sitter-dashboard-avatar";
import { SITTER_HELP_ICON_CLASS } from "@/components/sitter/sitter-help-icon";
import { buildDashboardGreetingTitle } from "@/lib/user/use-dashboard-greeting-name";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { RATINGS_TABLE } from "@/lib/ratings/constants";
import { sitterDashboardSerialLabel } from "@/lib/public/sequential-display-id";
import { useSitterProfileBoostProgress } from "@/lib/sitter/use-sitter-profile-boost-progress";
import {
  isMissingRpcError,
  isRpcKnownMissing,
  markRpcMissing
} from "@/lib/supabase/rpc-availability";

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
  showBusinessCard?: boolean;
  onOpenBusinessCard?: () => void;
  footer?: ReactNode;
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
  showBusinessCard = true,
  onOpenBusinessCard,
  footer = null
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

  const boost = useSitterProfileBoostProgress(sitterId);
  const greeting = buildDashboardGreetingTitle(firstName, nameLoading);
  const statsLoading = !sitterId || loadState === "loading" || loadState === "idle";
  const displayIdValue = sitterDashboardSerialLabel(publicDisplayId);
  const numericRating = stats.avg_rating != null ? Number(stats.avg_rating).toFixed(1) : "0.0";
  const reviewsCount = stats.rating_count || 0;

  return (
    <section className="relative isolate w-full min-w-0 overflow-visible rounded-[1.35rem] border border-[#C9E8D4] bg-white px-2.5 pb-2.5 pt-2.5 shadow-[0_10px_24px_-18px_rgba(14,90,60,0.35)]">
      <div className="relative flex min-w-0 items-start justify-between gap-2" dir="ltr">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-right" dir="rtl">
          <h1
            className={`w-full break-words text-right text-base font-bold leading-tight text-[#001F3F] min-[360px]:text-lg ${
              nameLoading ? "animate-pulse" : ""
            }`}
          >
            {greeting}
          </h1>
          {showPublicId && displayIdValue ? (
            <span
              className="inline-flex w-fit max-w-full shrink-0 items-center gap-1 rounded-md border border-purple-200 bg-purple-100 px-2 py-0.5 text-[12px] font-bold text-purple-800"
              dir="ltr"
            >
              <span>{displayIdValue}</span>
              <span className="text-[11px] font-normal text-purple-500">ID</span>
            </span>
          ) : showPublicId && !publicIdLoaded ? (
            <span className="inline-block h-5 w-16 shrink-0 animate-pulse rounded-md bg-purple-100/80" aria-hidden />
          ) : null}
          {statsLoading ? (
            <span className="inline-block h-5 w-28 animate-pulse rounded-md bg-amber-50" aria-hidden />
          ) : loadState === "ready" ? (
            <div className="inline-flex w-fit max-w-full shrink-0 flex-wrap items-center gap-1 rounded-md border border-amber-200/60 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
              <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
              <span>{numericRating}</span>
              <span className="text-[13px] text-slate-400">({reviewsCount} חוות דעת)</span>
            </div>
          ) : null}
        </div>
        <SitterDashboardAvatar
          src={avatarUrl}
          name={firstName ?? ""}
          userId={sitterId}
          completed={boost.progress.completed}
          ready={boost.status === "ready"}
        />
        {showBusinessCard ? (
          <div className="absolute bottom-0 left-0 flex max-w-[calc(100%-6.75rem)] min-w-0 items-center gap-1" dir="rtl">
            <button
              type="button"
              onClick={onOpenBusinessCard}
              className="inline-flex h-7 min-h-7 items-center justify-center gap-1 rounded-full border border-[#001F3F] bg-[#FFFDF8] px-2.5 text-[12px] font-bold leading-none text-[#001F3F] shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#001F3F] focus-visible:ring-offset-2"
            >
              <IdCard className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">כרטיס הביקור שלי</span>
            </button>
            <ParentProfileCardHelp buttonClassName={SITTER_HELP_ICON_CLASS} />
          </div>
        ) : null}
      </div>
      {footer ? <div className="mt-1.5">{footer}</div> : null}
    </section>
  );
}
