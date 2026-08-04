"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  EMPTY_CURRENT_USER_RATING,
  formatCurrentUserRatingBadgeText,
  formatNannyIdBadgeText,
  parseCurrentUserRating,
  type CurrentUserRating
} from "@/lib/ratings/current-user-rating";
import { RATINGS_TABLE } from "@/lib/ratings/constants";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  isMissingRpcError,
  isRpcKnownMissing,
  markRpcMissing
} from "@/lib/supabase/rpc-availability";

type LoadState = "idle" | "loading" | "ready" | "error";

const ratingBadgeClass =
  "inline-flex max-w-full items-center justify-end gap-1 rounded-full bg-amber-50/90 px-3 py-1 text-xs font-semibold tabular-nums text-amber-950 ring-1 ring-amber-200/80";

const nannyIdBadgeClass =
  "inline-flex max-w-full items-center justify-end gap-1 rounded-full bg-indigo-50/95 px-3 py-1 text-xs font-semibold text-indigo-950 ring-1 ring-indigo-200/80";

type CurrentUserRatingBadgeProps = {
  className?: string;
  /** When true, reserve space for nanny ID pill (sitter dashboard). */
  showNannyId?: boolean;
};

const GET_CURRENT_USER_RATING_RPC = "get_current_user_rating";

async function loadRatingFromTable(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  userId: string
): Promise<CurrentUserRating> {
  const { data: rows, error } = await supabase
    .from(RATINGS_TABLE)
    .select("rating")
    .eq("to_user_id", userId);
  if (error) return EMPTY_CURRENT_USER_RATING;

  const ratings = (rows ?? [])
    .map((r) => Number((r as { rating?: unknown }).rating))
    .filter((n) => Number.isFinite(n));
  const rating_count = ratings.length;
  const avg_rating =
    rating_count > 0 ? ratings.reduce((a, b) => a + b, 0) / rating_count : null;
  return { avg_rating, rating_count, nanny_id_number: null };
}

export function CurrentUserRatingBadge({ className = "", showNannyId = false }: CurrentUserRatingBadgeProps) {
  const { signedIn, isLoading: authLoading, user } = useAuth();
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [rating, setRating] = useState<CurrentUserRating>(EMPTY_CURRENT_USER_RATING);

  useEffect(() => {
    if (authLoading) return;
    if (!signedIn || !user?.id) {
      setLoadState("idle");
      setRating(EMPTY_CURRENT_USER_RATING);
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
          setRating(parseCurrentUserRating(data));
          setLoadState("ready");
          return;
        }
        if (isMissingRpcError(error)) {
          markRpcMissing(GET_CURRENT_USER_RATING_RPC);
        }
      }

      const fallback = await loadRatingFromTable(supabase, user.id);
      if (cancelled) return;
      setRating(fallback);
      setLoadState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn, authLoading, user?.id]);

  if (!signedIn || authLoading) {
    return (
      <div className={`flex flex-wrap items-center justify-end gap-2 ${className}`} dir="rtl">
        <span className="inline-block h-7 w-36 animate-pulse rounded-full bg-slate-100/90" aria-hidden />
        {showNannyId ? (
          <span className="inline-block h-7 w-40 animate-pulse rounded-full bg-slate-100/90" aria-hidden />
        ) : null}
      </div>
    );
  }

  if (loadState === "loading" || loadState === "idle") {
    return (
      <div className={`flex flex-wrap items-center justify-end gap-2 ${className}`} dir="rtl" aria-busy="true">
        <span
          className="inline-block h-7 w-36 animate-pulse rounded-full bg-amber-50/80 ring-1 ring-amber-200/60"
          aria-label="טוען דירוג"
        />
        {showNannyId ? (
          <span
            className="inline-block h-7 w-40 animate-pulse rounded-full bg-indigo-50/80 ring-1 ring-indigo-200/60"
            aria-label="טוען מספר נני"
          />
        ) : null}
      </div>
    );
  }

  const ratingLabel = formatCurrentUserRatingBadgeText(rating);
  const nannyLabel = showNannyId ? formatNannyIdBadgeText(rating.nanny_id_number) : null;

  return (
    <div className={`flex flex-wrap items-center justify-end gap-2 ${className}`} dir="rtl">
      <span className={ratingBadgeClass} title={ratingLabel}>
        {ratingLabel}
      </span>
      {nannyLabel && rating.nanny_id_number ? (
        <span className={nannyIdBadgeClass} title={nannyLabel}>
          <span aria-hidden>🆔</span>
          <span>
            מספר נני:{" "}
            <span className="font-bold tracking-tight">{rating.nanny_id_number}</span>
          </span>
        </span>
      ) : null}
    </div>
  );
}
