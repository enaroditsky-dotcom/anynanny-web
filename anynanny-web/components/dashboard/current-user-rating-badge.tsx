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
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

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

export function CurrentUserRatingBadge({ className = "", showNannyId = false }: CurrentUserRatingBadgeProps) {
  const { signedIn, isLoading: authLoading } = useAuth();
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [rating, setRating] = useState<CurrentUserRating>(EMPTY_CURRENT_USER_RATING);

  useEffect(() => {
    if (authLoading) return;
    if (!signedIn) {
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
    void supabase.rpc("get_current_user_rating").then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setLoadState("error");
        return;
      }
      setRating(parseCurrentUserRating(data));
      setLoadState("ready");
    });

    return () => {
      cancelled = true;
    };
  }, [signedIn, authLoading]);

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
