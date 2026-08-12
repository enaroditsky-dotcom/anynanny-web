"use client";

import { useState } from "react";
import {
  Check,
  Eye,
  ShieldAlert,
  ShieldCheck,
  Star,
  User,
  Users,
  X
} from "lucide-react";

import type { TodaysLinkedBookingView } from "@/lib/bookings/todays-linked-booking";

import {
  resolveShiftTimeWindow,
  sitterHasOverlappingActiveShift,
  SITTER_OVERLAP_APPROVE_MESSAGE
} from "@/lib/bookings/sitter-shift-overlap";

import {
  formatBookingSchedule,
  updateBookingStatus,
  type PendingBookingView
} from "@/lib/bookings/sitter-pending-bookings";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  sitterId: string;
  booking: TodaysLinkedBookingView;

  onResponded?: (result: {
    status: "approved" | "rejected";
    booking: PendingBookingView | null;
  }) => void;

  onError?: (message: string) => void;
};

type ParentPreview = {
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

function normalizeRatingAverage(
  value: unknown
): number | null {
  const numeric = Number(value);

  if (
    !Number.isFinite(numeric) ||
    numeric <= 0
  ) {
    return null;
  }

  return numeric;
}

function normalizeRatingCount(
  value: unknown
): number {
  const numeric = Number(value);

  if (
    !Number.isFinite(numeric) ||
    numeric <= 0
  ) {
    return 0;
  }

  return Math.floor(numeric);
}

export function SitterShiftApprovalCard({
  sitterId,
  booking,
  onResponded,
  onError
}: Props) {
  const [busy, setBusy] =
    useState(false);

  const [
    actionError,
    setActionError
  ] = useState<string | null>(
    null
  );

  const [
    showParentDetails,
    setShowParentDetails
  ] = useState(false);

  const [
    parentInfo,
    setParentInfo
  ] =
    useState<ParentPreview | null>(
      null
    );

  const [
    loadingParentInfo,
    setLoadingParentInfo
  ] = useState(false);

  const [
    parentInfoError,
    setParentInfoError
  ] = useState<string | null>(
    null
  );

  const loadParentInfo =
    async () => {
      if (loadingParentInfo) {
        return;
      }

      setLoadingParentInfo(
        true
      );

      setParentInfoError(
        null
      );

      try {
        const response =
          await fetch(
            `/api/sitter/bookings/${encodeURIComponent(
              booking.id
            )}/parent-preview`,
            {
              method: "GET",
              cache: "no-store"
            }
          );

        const json =
          (await response.json()) as {
            parent?: ParentPreview;
            error?: string;
          };

        if (!response.ok) {
          setParentInfo(null);

          setParentInfoError(
            json.error ||
              "לא ניתן לטעון את פרטי ההורה."
          );

          return;
        }

        setParentInfo(
          json.parent ?? null
        );

        if (!json.parent) {
          setParentInfoError(
            "לא נמצאו פרטי הורה להצגה."
          );
        }
      } catch (err) {
        console.error(
          "[SitterShiftApprovalCard parent-preview]",
          err
        );

        setParentInfo(null);

        setParentInfoError(
          "שגיאה בטעינת פרטי ההורה."
        );
      } finally {
        setLoadingParentInfo(
          false
        );
      }
    };

  const openParentDetails =
    () => {
      setShowParentDetails(
        true
      );

      void loadParentInfo();
    };

  const closeParentDetails =
    () => {
      setShowParentDetails(
        false
      );
    };

  const handleRespond =
    async (
      status:
        | "approved"
        | "rejected"
    ) => {
      if (busy) {
        return;
      }

      const supabase =
        getSupabaseBrowserClient();

      if (!supabase) {
        const message =
          "Supabase לא זמין";

        setActionError(
          message
        );

        onError?.(message);

        return;
      }

      if (
        status ===
        "approved"
      ) {
        const proposedWindow =
          resolveShiftTimeWindow(
            booking
          );

        if (proposedWindow) {
          const hasOverlap =
            await sitterHasOverlappingActiveShift(
              supabase,
              sitterId,
              proposedWindow,
              {
                bookingId:
                  booking.id
              }
            );

          if (hasOverlap) {
            console.warn(
              "[AnyNanny Overlap Sitter Safe-Guard]:",
              SITTER_OVERLAP_APPROVE_MESSAGE
            );
          }
        }
      }

      setBusy(true);
      setActionError(null);

      const {
        row,
        error
      } =
        await updateBookingStatus(
          supabase,
          sitterId,
          booking.id,
          status
        );

      setBusy(false);

      if (error) {
        setActionError(error);

        onError?.(error);

        return;
      }

      const respondedBooking =
        row
          ? ({
              ...booking,
              ...row,
              status,
              parent_full_name:
                booking.partner_full_name
            } as PendingBookingView)
          : null;

      onResponded?.({
        status,
        booking:
          respondedBooking
      });
    };

  const ratingAverage =
    normalizeRatingAverage(
      parentInfo
        ?.rating_average
    );

  const ratingCount =
    normalizeRatingCount(
      parentInfo
        ?.rating_count
    );

  const hasRating =
    ratingAverage != null &&
    ratingCount > 0;

  return (
    <>
      <div
        className="space-y-4 rounded-3xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm"
        dir="rtl"
      >
        <div className="space-y-1 text-right">
          <p className="text-sm font-bold text-amber-900">
            בקשת משמרת חדשה
          </p>

          <p className="text-sm font-bold text-[#001F3F]">
            {booking.partner_full_name ??
              "הורה"}
          </p>

          <button
            type="button"
            onClick={
              openParentDetails
            }
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs font-bold text-violet-700 transition hover:bg-violet-50 hover:text-violet-900"
          >
            <Eye
              className="h-4 w-4 shrink-0"
              aria-hidden
            />

            פרטי ההורה
          </button>
        </div>

        <p className="text-right text-sm font-semibold text-slate-700">
          {booking.schedule_label ||
            formatBookingSchedule(
              booking
            )}
        </p>

        <p className="text-right text-xs leading-relaxed text-slate-600">
          יש לאשר או לדחות את
          הבקשה לפני שתוכלו
          להתחיל את המשמרת.
        </p>

        {actionError ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
            {actionError}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void handleRespond(
                "approved"
              )
            }
            className="inline-flex flex-row-reverse items-center justify-center gap-2 rounded-xl bg-[#001F3F] px-4 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            <Check
              className="h-4 w-4 shrink-0"
              aria-hidden
            />

            {busy
              ? "מעדכנים…"
              : "אשר בקשה"}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void handleRespond(
                "rejected"
              )
            }
            className="inline-flex flex-row-reverse items-center justify-center gap-2 rounded-xl border-2 border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-800 transition hover:bg-rose-50 disabled:opacity-50"
          >
            <X
              className="h-4 w-4 shrink-0"
              aria-hidden
            />

            דחה בקשה
          </button>
        </div>
      </div>

      {showParentDetails ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="parent-details-title"
          onClick={
            closeParentDetails
          }
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl"
            dir="rtl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2
                id="parent-details-title"
                className="text-lg font-extrabold text-[#001F3F]"
              >
                פרטי ההורה
              </h2>

              <button
                type="button"
                onClick={
                  closeParentDetails
                }
                aria-label="סגור"
                className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5">
              {loadingParentInfo ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-slate-500">
                    טוען פרטי הורה…
                  </p>
                </div>
              ) : parentInfoError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-center">
                  <p className="text-sm text-rose-800">
                    {
                      parentInfoError
                    }
                  </p>
                </div>
              ) : parentInfo ? (
                <div className="space-y-5">
                  <div className="flex flex-col items-center text-center">
                    <div className="h-24 w-24 overflow-hidden rounded-full border-2 border-slate-200 bg-slate-100 shadow-sm">
                      {parentInfo.avatar_url ? (
                        <img
                          src={
                            parentInfo.avatar_url
                          }
                          alt={
                            parentInfo.first_name ||
                            "הורה"
                          }
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          <User className="h-11 w-11" />
                        </div>
                      )}
                    </div>

                    <h3 className="mt-3 text-lg font-extrabold text-[#001F3F]">
                      {parentInfo.first_name ||
                        booking.partner_full_name ||
                        "הורה"}
                    </h3>

                    <div className="mt-2">
                      {hasRating ? (
                        <div className="inline-flex flex-row-reverse items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
                          <Star
                            className="h-4 w-4 fill-amber-400 text-amber-400"
                            aria-hidden
                          />

                          <span>
                            {ratingAverage.toFixed(
                              1
                            )}
                          </span>

                          <span className="font-medium text-amber-700">
                            ·{" "}
                            {ratingCount ===
                            1
                              ? "חוות דעת אחת"
                              : `${ratingCount} חוות דעת`}
                          </span>
                        </div>
                      ) : (
                        <div className="inline-flex flex-row-reverse items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500">
                          <Star
                            className="h-4 w-4 text-slate-300"
                            aria-hidden
                          />

                          טרם דורג
                        </div>
                      )}
                    </div>

                    <div className="mt-2">
                      {parentInfo.identity_verified ? (
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                          <ShieldCheck className="h-4 w-4" />

                          זהות ההורה אומתה
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
                          <ShieldAlert className="h-4 w-4" />

                          זהות ההורה טרם
                          אומתה
                        </div>
                      )}
                    </div>
                  </div>

                  {Array.isArray(parentInfo.reviews) &&
                  parentInfo.reviews.length > 0 ? (
                    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 text-right">
                      <p className="text-xs font-semibold text-slate-500">
                        חוות דעת מבייביסיטרים
                      </p>
                      <ul className="space-y-2.5">
                        {parentInfo.reviews.slice(0, 3).map((review, idx) => (
                          <li
                            key={`${review.created_at}-${idx}`}
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
                        <p className="text-xs font-semibold text-slate-500">
                          ילדים
                        </p>

                        <p className="mt-0.5 text-sm font-bold text-[#001F3F]">
                          {parentInfo.children_count !=
                          null
                            ? `${parentInfo.children_count} ילדים`
                            : "מספר הילדים לא צוין"}
                        </p>

                        <p className="mt-1 text-xs text-slate-600">
                          {parentInfo.children_ages
                            ? `גילאים: ${parentInfo.children_ages}`
                            : "גילאי הילדים לא צוינו"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {parentInfo.address_visible &&
                  parentInfo.address ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-right">
                      <p className="text-xs font-semibold text-emerald-700">
                        כתובת המשמרת
                      </p>

                      <p className="mt-1 text-sm font-bold text-[#001F3F]">
                        {
                          parentInfo.address
                        }
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-right">
                      <p className="text-xs leading-relaxed text-slate-500">
                        הכתובת המלאה תוצג
                        לאחר אישור
                        המשמרת.
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={
                      closeParentDetails
                    }
                    className="w-full rounded-xl bg-[#001F3F] px-4 py-3 text-sm font-bold text-white transition hover:brightness-110"
                  >
                    סגור
                  </button>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">
                  לא נמצאו פרטי הורה
                  להצגה.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}