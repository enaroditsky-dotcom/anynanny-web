"use client";

import { useState } from "react";
import {
  Eye,
  ShieldAlert,
  ShieldCheck,
  Star,
  User,
  Users,
  X
} from "lucide-react";

export type SitterVisibleParentPreview = {
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

type Props = {
  bookingId: string;
  fallbackParentName?: string | null;
  label?: string;
  className?: string;
};

function normalizeRatingAverage(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function normalizeRatingCount(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

export function SitterParentProfilePreview({
  bookingId,
  fallbackParentName,
  label = "פרטי ההורה",
  className = ""
}: Props) {
  const [open, setOpen] = useState(false);
  const [parent, setParent] = useState<SitterVisibleParentPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPreview = async () => {
    setOpen(true);
    if (loading || parent) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/sitter/bookings/${encodeURIComponent(bookingId)}/parent-preview`,
        { method: "GET", cache: "no-store" }
      );
      const json = (await response.json().catch(() => ({}))) as {
        parent?: SitterVisibleParentPreview;
        error?: string;
      };

      if (!response.ok || !json.parent) {
        setParent(null);
        setError(json.error || "לא ניתן לטעון את פרטי ההורה.");
        return;
      }

      setParent(json.parent);
    } catch (previewError) {
      console.error("[SitterParentProfilePreview]", previewError);
      setParent(null);
      setError("שגיאה בטעינת פרטי ההורה.");
    } finally {
      setLoading(false);
    }
  };

  const ratingAverage = normalizeRatingAverage(parent?.rating_average);
  const ratingCount = normalizeRatingCount(parent?.rating_count);
  const hasRating = ratingAverage != null && ratingCount > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => void openPreview()}
        className={`inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs font-bold text-violet-700 transition hover:bg-violet-50 hover:text-violet-900 ${className}`}
      >
        <Eye className="h-4 w-4 shrink-0" aria-hidden />
        {label}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`parent-details-title-${bookingId}`}
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-3xl bg-white shadow-2xl"
            dir="rtl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
              <h2
                id={`parent-details-title-${bookingId}`}
                className="text-lg font-extrabold text-[#001F3F]"
              >
                פרטי ההורה
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="סגור"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5">
              {loading ? (
                <p className="py-8 text-center text-sm text-slate-500">טוען פרטי הורה…</p>
              ) : error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-center">
                  <p className="text-sm text-rose-800">{error}</p>
                </div>
              ) : parent ? (
                <div className="space-y-5">
                  <div className="flex flex-col items-center text-center">
                    <div className="h-24 w-24 overflow-hidden rounded-full border-2 border-slate-200 bg-slate-100 shadow-sm">
                      {parent.avatar_url ? (
                        <img
                          src={parent.avatar_url}
                          alt={parent.first_name || "הורה"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          <User className="h-11 w-11" />
                        </div>
                      )}
                    </div>

                    <h3 className="mt-3 text-lg font-extrabold text-[#001F3F]">
                      {parent.first_name || fallbackParentName || "הורה"}
                    </h3>

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

                    <div className="mt-2">
                      {parent.identity_verified ? (
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                          <ShieldCheck className="h-4 w-4" />
                          זהות ההורה אומתה
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
                          <ShieldAlert className="h-4 w-4" />
                          זהות ההורה טרם אומתה
                        </div>
                      )}
                    </div>
                  </div>

                  {Array.isArray(parent.reviews) && parent.reviews.length > 0 ? (
                    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 text-right">
                      <p className="text-xs font-semibold text-slate-500">
                        חוות דעת מבייביסיטרים
                      </p>
                      <ul className="space-y-2.5">
                        {parent.reviews.slice(0, 3).map((review, index) => (
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
                                <span className="text-[10px] tabular-nums text-slate-400">
                                  {new Date(review.created_at).toLocaleDateString("he-IL")}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-slate-700">
                              {review.comment}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
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
                          {parent.children_ages
                            ? `גילאים: ${parent.children_ages}`
                            : "גילאי הילדים לא צוינו"}
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

                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="w-full rounded-xl bg-[#001F3F] px-4 py-3 text-sm font-bold text-white transition hover:brightness-110"
                  >
                    חזרה למשמרות
                  </button>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">
                  לא נמצאו פרטי הורה להצגה.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
