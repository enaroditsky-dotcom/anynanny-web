"use client";

import { useId, useState } from "react";
import { ChevronDown, ShieldAlert, Star, User, Users, X } from "lucide-react";

import {
  VERIFIED_PARENT_IDENTITY_LABEL,
  VerifiedUserBadge
} from "@/components/identity/verified-user-badge";
import { UserSafetyActions } from "@/components/safety/user-safety-actions";
import {
  AUTH_MODAL_BODY_SCROLL,
  AUTH_MODAL_CARD_SHELL,
  AUTH_MODAL_CENTER_WRAP,
  AUTH_MODAL_HEADER,
  AUTH_MODAL_OVERLAY_SCROLL
} from "@/lib/ui/auth-modal-overlay";

export type ParentDetailsPreview = {
  id?: string | null;
  first_name?: string | null;
  avatar_url?: string | null;
  rating_average?: number | null;
  rating_count?: number | null;
  reviews?: Array<{
    rating: number;
    comment: string;
    created_at: string;
  }> | null;
  children_count?: number | null;
  children_ages?: string | null;
  identity_verified?: boolean;
  address?: string | null;
  address_visible?: boolean;
};

export function normalizeParentRatingAverage(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function normalizeParentRatingCount(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

function ParentReviewsAccordion({
  reviews,
  ratingCount
}: {
  reviews: NonNullable<ParentDetailsPreview["reviews"]>;
  ratingCount: number;
}) {
  const reactId = useId();
  const panelId = `${reactId}-reviews`;
  const headerId = `${reactId}-reviews-header`;
  const [open, setOpen] = useState(false);
  const visibleReviews = reviews.slice(0, 3);
  const count = ratingCount > 0 ? ratingCount : reviews.length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white text-right">
      <h3 className="m-0 text-xs font-semibold text-slate-500">
        <button
          type="button"
          id={headerId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 text-right outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-[#001F3F]/25 focus-visible:ring-offset-2"
        >
          <span className="min-w-0 flex-1 text-xs font-bold text-slate-600">
            {count > 0
              ? `חוות דעת מבייביסיטרים (${count})`
              : "חוות דעת מבייביסיטרים"}
          </span>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden
          />
        </button>
      </h3>
      {open ? (
        <div id={panelId} role="region" aria-labelledby={headerId} className="space-y-2 px-4 pb-4">
          <ul className="space-y-2.5">
            {visibleReviews.map((review, index) => (
              <li
                key={`${review.created_at}-${index}`}
                className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2"
              >
                <div className="flex flex-row-reverse items-center justify-between gap-2">
                  <span className="inline-flex flex-row-reverse items-center gap-1 text-xs font-bold text-amber-800">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                    {Number(review.rating).toFixed(0)}
                  </span>
                  {review.created_at ? (
                    <span className="text-[12px] tabular-nums text-slate-400">
                      {new Date(review.created_at).toLocaleDateString("he-IL")}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-700">{review.comment}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ParentDetailsBody({
  parent,
  fallbackName,
  safetyUserId,
  closeLabel,
  onClose
}: {
  parent: ParentDetailsPreview;
  fallbackName?: string | null;
  safetyUserId?: string | null;
  closeLabel: string;
  onClose: () => void;
}) {
  const ratingAverage = normalizeParentRatingAverage(parent.rating_average);
  const ratingCount = normalizeParentRatingCount(parent.rating_count);
  const hasRating = ratingAverage != null && ratingCount > 0;
  const displayName = parent.first_name || fallbackName || "הורה";
  const reviews = Array.isArray(parent.reviews) ? parent.reviews : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center text-center">
        <div className="h-24 w-24 overflow-hidden rounded-full border-2 border-slate-200 bg-slate-100 shadow-sm">
          {parent.avatar_url ? (
            <img
              src={parent.avatar_url}
              alt={displayName}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-400">
              <User className="h-11 w-11" />
            </div>
          )}
        </div>

        <h3 className="mt-3 text-lg font-extrabold text-[#001F3F]">{displayName}</h3>

        <div className="mt-2 flex justify-center">
          {parent.identity_verified ? (
            <VerifiedUserBadge size="xl" label={VERIFIED_PARENT_IDENTITY_LABEL} />
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
              <ShieldAlert className="h-4 w-4" />
              זהות ההורה טרם אומתה
            </div>
          )}
        </div>

        <div className="mt-2">
          {hasRating ? (
            <div className="inline-flex flex-row-reverse items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
              <span>{ratingAverage.toFixed(1)}</span>
              <span className="font-medium text-amber-700">
                · {ratingCount === 1 ? "חוות דעת אחת" : `${ratingCount} חוות דעת`}
              </span>
            </div>
          ) : (
            <div className="inline-flex flex-row-reverse items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500">
              <Star className="h-4 w-4 text-slate-300" aria-hidden />
              טרם דורג
            </div>
          )}
        </div>
      </div>

      {reviews.length > 0 ? (
        <ParentReviewsAccordion reviews={reviews} ratingCount={ratingCount} />
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <Users className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 text-right">
            <p className="text-xs font-semibold text-slate-500">ילדים</p>
            <p className="mt-0.5 text-sm font-bold text-[#001F3F]">
              {parent.children_count != null
                ? `${parent.children_count} ילדים`
                : "מספר הילדים לא צוין"}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {parent.children_ages ? `גילאים: ${parent.children_ages}` : "גילאי הילדים לא צוינו"}
            </p>
          </div>
        </div>
      </div>

      {parent.address_visible && parent.address ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-right">
          <p className="text-xs font-semibold text-emerald-700">כתובת המשמרת</p>
          <p className="mt-1 text-sm font-bold text-[#001F3F]">{parent.address}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-right">
          <p className="text-xs leading-relaxed text-slate-500">
            הכתובת המלאה תוצג לאחר אישור המשמרת.
          </p>
        </div>
      )}

      {safetyUserId ? (
        <UserSafetyActions targetUserId={safetyUserId} targetName={displayName} />
      ) : null}

      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-xl bg-[#001F3F] px-4 py-3 text-sm font-bold text-white transition hover:brightness-110"
      >
        {closeLabel}
      </button>
    </div>
  );
}

export function ParentDetailsModal({
  open,
  titleId,
  onClose,
  loading,
  error,
  parent,
  fallbackName,
  safetyUserId,
  closeLabel
}: {
  open: boolean;
  titleId: string;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  parent: ParentDetailsPreview | null;
  fallbackName?: string | null;
  safetyUserId?: string | null;
  closeLabel: string;
}) {
  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] ${AUTH_MODAL_OVERLAY_SCROLL} bg-black/45`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div className={AUTH_MODAL_CENTER_WRAP}>
        <div className={`my-auto ${AUTH_MODAL_CARD_SHELL}`} dir="rtl" onClick={(event) => event.stopPropagation()}>
          <div className={AUTH_MODAL_HEADER}>
            <h2 id={titleId} className="text-lg font-extrabold text-[#001F3F]">
              פרטי ההורה
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="סגור"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className={AUTH_MODAL_BODY_SCROLL}>
            {loading ? (
              <p className="py-8 text-center text-sm text-slate-500">טוען פרטי הורה…</p>
            ) : error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-center">
                <p className="text-sm text-rose-800">{error}</p>
              </div>
            ) : parent ? (
              <ParentDetailsBody
                parent={parent}
                fallbackName={fallbackName}
                safetyUserId={safetyUserId}
                closeLabel={closeLabel}
                onClose={onClose}
              />
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">לא נמצאו פרטי הורה להצגה.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
