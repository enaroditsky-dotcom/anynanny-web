"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import {
  BellRing,
  CalendarClock,
  Check,
  X,
  MapPin,
  Users,
  ShieldCheck,
  ShieldAlert,
  Star
} from "lucide-react";

import type {
  RealtimePostgresChangesPayload
} from "@supabase/supabase-js";

import { ActionToast } from "@/components/ui/action-toast";

import {
  BOOKINGS_TABLE,
  type BookingRow
} from "@/lib/bookings/constants";

import {
  fetchPendingBookingsForSitter,
  formatBookingSchedule,
  updateBookingStatus,
  type PendingBookingView
} from "@/lib/bookings/sitter-pending-bookings";

import {
  resolveShiftTimeWindow,
  sitterHasOverlappingActiveShift,
  SITTER_OVERLAP_APPROVE_MESSAGE
} from "@/lib/bookings/sitter-shift-overlap";

import {
  getSupabaseBrowserClient
} from "@/lib/supabase/client";

import {
  removeRealtimeChannel,
  subscribePostgresChanges
} from "@/lib/supabase/subscribe-postgres-changes";

const NEW_BOOKING_TOAST_MS = 6000;

function tryVibrate(pattern: number[]) {
  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    ) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* haptics best-effort */
  }
}

type Props = {
  sitterId: string | null;
  disabled?: boolean;

  /** Fired after approve/reject succeeds — use to refresh linked booking + confirmed shifts. */
  onResponded?: (result: {
    status: "approved" | "rejected";
    booking: PendingBookingView | null;
  }) => void;
};

type ParentDetails = {
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

export function SitterPendingBookings({
  sitterId,
  disabled = false,
  onResponded
}: Props) {
  const [
    bookings,
    setBookings
  ] = useState<PendingBookingView[]>([]);

  const [
    loading,
    setLoading
  ] = useState(true);

  const [
    loadError,
    setLoadError
  ] = useState<string | null>(null);

  const [
    actingId,
    setActingId
  ] = useState<string | null>(null);

  const [
    actionError,
    setActionError
  ] = useState<string | null>(null);

  const [
    newBookingFlash,
    setNewBookingFlash
  ] = useState(false);

  const [
    respondToast,
    setRespondToast
  ] = useState<string | null>(null);

  const [
    respondToastApproved,
    setRespondToastApproved
  ] = useState(true);

  const [
    parentDetailsMap,
    setParentDetailsMap
  ] = useState<
    Record<string, ParentDetails>
  >({});

  const initialLoadDoneRef =
    useRef(false);

  const load = useCallback(
    async () => {
      if (!sitterId) {
        setBookings([]);
        setLoading(false);
        return;
      }

      const supabase =
        getSupabaseBrowserClient();

      if (!supabase) {
        setLoadError(
          "Supabase לא זמין"
        );
        setLoading(false);
        return;
      }

      setLoadError(null);

      const {
        bookings: rows,
        error
      } =
        await fetchPendingBookingsForSitter(
          supabase,
          sitterId
        );

      setBookings(rows);
      setLoadError(error);
      setLoading(false);

      if (
        rows &&
        rows.length > 0
      ) {
        const previewEntries =
          await Promise.all(
            rows.map(
              async (booking) => {
                try {
                  const response =
                    await fetch(
                      `/api/sitter/bookings/${encodeURIComponent(
                        booking.id
                      )}/parent-preview`,
                      {
                        method: "GET",
                        cache:
                          "no-store"
                      }
                    );

                  if (
                    !response.ok
                  ) {
                    return [
                      booking.parent_id,
                      null
                    ] as const;
                  }

                  const json =
                    (await response.json()) as {
                      parent?: ParentDetails;
                    };

                  return [
                    booking.parent_id,
                    json.parent ?? null
                  ] as const;
                } catch {
                  return [
                    booking.parent_id,
                    null
                  ] as const;
                }
              }
            )
          );

        const nextParentDetailsMap:
          Record<
            string,
            ParentDetails
          > = {};

        for (
          const [
            parentId,
            details
          ] of previewEntries
        ) {
          if (
            parentId &&
            details
          ) {
            nextParentDetailsMap[
              parentId
            ] = details;
          }
        }

        setParentDetailsMap(
          nextParentDetailsMap
        );
      } else {
        setParentDetailsMap({});
      }
    },
    [sitterId]
  );

  useEffect(() => {
    if (
      !sitterId ||
      disabled
    ) {
      setLoading(false);
      return;
    }

    setLoading(true);
    initialLoadDoneRef.current =
      false;

    void load().then(() => {
      initialLoadDoneRef.current =
        true;
    });
  }, [
    sitterId,
    disabled,
    load
  ]);

  useEffect(() => {
    if (!newBookingFlash) {
      return;
    }

    const id =
      window.setTimeout(
        () =>
          setNewBookingFlash(
            false
          ),
        NEW_BOOKING_TOAST_MS
      );

    return () =>
      window.clearTimeout(id);
  }, [newBookingFlash]);

  useEffect(() => {
    if (!respondToast) {
      return;
    }

    const id =
      window.setTimeout(
        () =>
          setRespondToast(null),
        4500
      );

    return () =>
      window.clearTimeout(id);
  }, [respondToast]);

  useEffect(() => {
    if (
      !sitterId ||
      disabled
    ) {
      return;
    }

    const supabase =
      getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    const handleInsert = (
      payload:
        RealtimePostgresChangesPayload<
          Record<
            string,
            unknown
          >
        >
    ) => {
      const row =
        (payload.new ??
          null) as
          | BookingRow
          | null;

      if (
        !row ||
        row.status !==
          "pending"
      ) {
        void load();
        return;
      }

      let appended = false;

      setBookings(
        (previous) => {
          if (
            previous.some(
              (booking) =>
                booking.id ===
                row.id
            )
          ) {
            return previous;
          }

          appended = true;

          const optimistic:
            PendingBookingView =
            {
              ...row,
              parent_full_name:
                null
            };

          return [
            optimistic,
            ...previous
          ];
        }
      );

      if (
        appended &&
        initialLoadDoneRef.current
      ) {
        setNewBookingFlash(
          true
        );

        tryVibrate([
          140,
          70,
          140
        ]);
      }

      void load();
    };

    const handleUpdate = (
      payload:
        RealtimePostgresChangesPayload<
          Record<
            string,
            unknown
          >
        >
    ) => {
      const row =
        (payload.new ??
          null) as
          | BookingRow
          | null;

      if (
        row &&
        row.status !==
          "pending"
      ) {
        setBookings(
          (previous) =>
            previous.filter(
              (booking) =>
                booking.id !==
                row.id
            )
        );

        return;
      }

      void load();
    };

    const handleDelete = (
      payload:
        RealtimePostgresChangesPayload<
          Record<
            string,
            unknown
          >
        >
    ) => {
      const old =
        (payload.old ??
          null) as
          | Partial<BookingRow>
          | null;

      if (old?.id) {
        setBookings(
          (previous) =>
            previous.filter(
              (booking) =>
                booking.id !==
                old.id
            )
        );
      }
    };

    const channel =
      subscribePostgresChanges(
        supabase,
        `sitter-bookings-${sitterId}`,
        [
          {
            event: "INSERT",
            table:
              BOOKINGS_TABLE,
            filter:
              `sitter_id=eq.${sitterId}`,
            handler:
              handleInsert
          },
          {
            event: "UPDATE",
            table:
              BOOKINGS_TABLE,
            filter:
              `sitter_id=eq.${sitterId}`,
            handler:
              handleUpdate
          },
          {
            event: "DELETE",
            table:
              BOOKINGS_TABLE,
            filter:
              `sitter_id=eq.${sitterId}`,
            handler:
              handleDelete
          }
        ]
      );

    return () => {
      removeRealtimeChannel(
        supabase,
        channel
      );
    };
  }, [
    sitterId,
    disabled,
    load
  ]);

  const handleRespond =
    async (
      bookingId: string,
      status:
        | "approved"
        | "rejected"
    ) => {
      if (
        !sitterId ||
        actingId
      ) {
        return;
      }

      const supabase =
        getSupabaseBrowserClient();

      if (!supabase) {
        setActionError(
          "Supabase לא זמין"
        );
        return;
      }

      const target =
        bookings.find(
          (booking) =>
            booking.id ===
            bookingId
        );

      if (
        status ===
          "approved" &&
        target
      ) {
        const proposedWindow =
          resolveShiftTimeWindow(
            target
          );

        if (proposedWindow) {
          const hasOverlap =
            await sitterHasOverlappingActiveShift(
              supabase,
              sitterId,
              proposedWindow,
              {
                bookingId
              }
            );

          if (hasOverlap) {
            window.alert(
              SITTER_OVERLAP_APPROVE_MESSAGE
            );
            return;
          }
        }
      }

      setActionError(null);
      setActingId(bookingId);

      setBookings(
        (previous) =>
          previous.filter(
            (booking) =>
              booking.id !==
              bookingId
          )
      );

      const {
        row,
        error
      } =
        await updateBookingStatus(
          supabase,
          sitterId,
          bookingId,
          status
        );

      setActingId(null);

      if (error) {
        setActionError(error);
        void load();
        return;
      }

      setRespondToast(
        status ===
          "approved"
          ? "המשמרת אושרה בהצלחה"
          : "המשמרת נדחתה — ההורה יקבל עדכון"
      );

      setRespondToastApproved(
        status ===
          "approved"
      );

      tryVibrate(
        status ===
          "approved"
          ? [
              100,
              50,
              100
            ]
          : [
              80,
              40,
              80
            ]
      );

      const respondedBooking =
        row && target
          ? ({
              ...target,
              ...row,
              status
            } as PendingBookingView)
          : row
            ? ({
                ...row,
                parent_full_name:
                  target?.parent_full_name ??
                  null
              } as PendingBookingView)
            : target ?? null;

      onResponded?.({
        status,
        booking:
          respondedBooking
      });

      void load();
    };

  if (
    disabled ||
    !sitterId
  ) {
    return null;
  }

  return (
    <section className="rounded-3xl border border-navy-header/12 bg-white p-4 shadow-soft sm:p-5">
      <div className="flex flex-row-reverse items-center justify-between gap-2">
        <h2 className="text-right text-base font-bold text-[#001F3F]">
          בקשות ממתינות לאישור
        </h2>

        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#001F3F]/10">
          <CalendarClock
            className="h-5 w-5 text-[#001F3F]"
            aria-hidden
          />
        </span>
      </div>

      <p className="mt-1 text-right text-xs text-slate-600">
        בקשות תיאום משמרת
        מהורים — אשרו או דחו
        כדי לעדכן את היומן.
      </p>

      {newBookingFlash ? (
        <div
          role="status"
          aria-live="assertive"
          className="mt-3 flex flex-row-reverse items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-right text-xs font-semibold text-emerald-900 shadow-sm"
        >
          <BellRing
            className="h-4 w-4 shrink-0"
            aria-hidden
          />

          <span>
            התקבלה בקשה חדשה —
            נוספה לרשימה למעלה
          </span>
        </div>
      ) : null}

      {respondToast ? (
        <div
          role="status"
          aria-live="assertive"
          className={`mt-3 flex flex-row-reverse items-center gap-2 rounded-xl border px-3 py-2 text-right text-xs font-semibold shadow-sm ${
            respondToastApproved
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-rose-300 bg-rose-50 text-rose-900"
          }`}
        >
          <button
            type="button"
            aria-label="סגור"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-70 transition hover:bg-white/70 hover:opacity-100"
            onClick={() =>
              setRespondToast(
                null
              )
            }
          >
            <X
              className="h-3.5 w-3.5"
              aria-hidden
            />
          </button>

          {respondToastApproved ? (
            <Check
              className="h-4 w-4 shrink-0"
              aria-hidden
            />
          ) : null}

          <span className="min-w-0 flex-1">
            {respondToast}
          </span>
        </div>
      ) : null}

      <ActionToast
        message={respondToast}
        variant={
          respondToastApproved
            ? "success"
            : "error"
        }
        onDismiss={() =>
          setRespondToast(null)
        }
      />

      {actionError ? (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-right text-xs text-rose-900">
          {actionError}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-right text-sm text-slate-500">
          טוען בקשות…
        </p>
      ) : loadError ? (
        <p className="mt-4 text-right text-sm text-rose-700">
          {loadError}
        </p>
      ) : bookings.length ===
        0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-navy-header/15 bg-[#FDFBF6]/80 px-4 py-5 text-center text-sm text-slate-500">
          אין בקשות ממתינות
          כרגע.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {bookings.map(
            (booking: any) => {
              const busy =
                actingId ===
                booking.id;

              const parentInfo =
                parentDetailsMap[
                  booking.parent_id
                ] || {};

              const ratingAverage =
                normalizeRatingAverage(
                  parentInfo.rating_average
                );

              const ratingCount =
                normalizeRatingCount(
                  parentInfo.rating_count
                );

              const hasRating =
                ratingAverage != null &&
                ratingCount > 0;

              return (
                <li
                  key={booking.id}
                  className="space-y-2.5 rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/90 p-4 text-right shadow-sm"
                >
                  <div>
                    <p className="text-sm font-bold text-[#001F3F]">
                      {booking.parent_full_name ??
                        "הורה"}
                    </p>

                    <p className="mt-1 text-xs font-medium tabular-nums text-slate-600">
                      {formatBookingSchedule(
                        booking
                      )}
                    </p>
                  </div>

                  {/* פרופיל הורה בטוח לפני אישור המשמרת */}
                  <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3 text-xs">
                    <div className="flex flex-row-reverse items-center gap-2.5">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
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
                          <div className="flex h-full w-full items-center justify-center text-sm font-bold text-slate-400">
                            {parentInfo.first_name?.charAt(
                              0
                            ) ||
                              "ה"}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 text-right">
                        <p className="font-bold text-[#001F3F]">
                          {parentInfo.first_name ||
                            booking.parent_full_name ||
                            "הורה"}
                        </p>

                        <p className="mt-0.5 text-[13px] text-slate-500">
                          פרטי המשפחה המזמינה
                        </p>

                        <div className="mt-1.5">
                          {hasRating ? (
                            <div className="inline-flex flex-row-reverse items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[13px] font-bold text-amber-800">
                              <Star
                                className="h-3.5 w-3.5 fill-amber-400 text-amber-400"
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
                            <div className="inline-flex flex-row-reverse items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[13px] font-medium text-slate-500">
                              <Star
                                className="h-3.5 w-3.5 text-slate-300"
                                aria-hidden
                              />

                              <span>
                                טרם דורג
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-2">
                      <div className="flex flex-row-reverse items-center justify-end gap-1.5 text-slate-700">
                        <Users className="h-3.5 w-3.5 shrink-0 text-violet-600" />

                        <span className="font-semibold">
                          ילדים:
                        </span>

                        <span>
                          {parentInfo.children_count !=
                          null
                            ? `${parentInfo.children_count} ילדים`
                            : "לא צוין מספר"}

                          {parentInfo.children_ages
                            ? ` · גילאים: ${parentInfo.children_ages}`
                            : ""}
                        </span>
                      </div>
                    </div>

                    <div>
                      {parentInfo.identity_verified ? (
                        <div className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-700">
                          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />

                          <span>
                            זהות ההורה
                            אומתה
                          </span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-700">
                          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />

                          <span>
                            זהות ההורה טרם
                            אומתה
                          </span>
                        </div>
                      )}
                    </div>

                    {Array.isArray(parentInfo.reviews) &&
                    parentInfo.reviews.length > 0 ? (
                      <div className="space-y-1.5 border-t border-slate-100 pt-2 text-right">
                        <p className="text-[13px] font-semibold text-slate-500">
                          חוות דעת אחרונות
                        </p>
                        {parentInfo.reviews.slice(0, 2).map((review, idx) => (
                          <div
                            key={`${review.created_at}-${idx}`}
                            className="rounded-lg bg-slate-50 px-2 py-1.5"
                          >
                            <div className="flex flex-row-reverse items-center justify-between gap-2">
                              <span className="inline-flex flex-row-reverse items-center gap-1 text-[13px] font-bold text-amber-800">
                                <Star
                                  className="h-3 w-3 fill-amber-400 text-amber-400"
                                  aria-hidden
                                />
                                {Number(review.rating).toFixed(0)}
                              </span>
                              {review.created_at ? (
                                <span className="text-[12px] tabular-nums text-slate-400">
                                  {new Date(review.created_at).toLocaleDateString("he-IL")}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-[13px] leading-snug text-slate-700">
                              {review.comment}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {parentInfo.address_visible &&
                    parentInfo.address ? (
                      <div className="flex flex-row-reverse items-center justify-end gap-1.5 border-t border-slate-100 pt-2 text-slate-700">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-violet-600" />

                        <span className="font-semibold">
                          כתובת:
                        </span>

                        <span>
                          {
                            parentInfo.address
                          }
                        </span>
                      </div>
                    ) : (
                      <p className="border-t border-slate-100 pt-2 text-right text-[13px] text-slate-400">
                        הכתובת המלאה תוצג
                        לאחר אישור
                        המשמרת.
                      </p>
                    )}
                  </div>

                  <p className="text-[13px] text-slate-500">
                    התקבלה{" "}
                    {new Date(
                      booking.created_at
                    ).toLocaleDateString(
                      "he-IL",
                      {
                        day:
                          "numeric",
                        month:
                          "short",
                        hour:
                          "2-digit",
                        minute:
                          "2-digit"
                      }
                    )}
                  </p>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void handleRespond(
                          booking.id,
                          "approved"
                        )
                      }
                      className="inline-flex flex-row-reverse items-center justify-center gap-2 rounded-xl bg-[#001F3F] px-3 py-2.5 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                    >
                      <Check
                        className="h-4 w-4 shrink-0"
                        aria-hidden
                      />

                      {busy
                        ? "מעדכנים…"
                        : "אישור משמרת"}
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void handleRespond(
                          booking.id,
                          "rejected"
                        )
                      }
                      className="inline-flex flex-row-reverse items-center justify-center gap-2 rounded-xl border-2 border-rose-200 bg-white px-3 py-2.5 text-xs font-semibold text-rose-800 transition hover:bg-rose-50 disabled:opacity-50"
                    >
                      <X
                        className="h-4 w-4 shrink-0"
                        aria-hidden
                      />

                      דחיית משמרת
                    </button>
                  </div>
                </li>
              );
            }
          )}
        </ul>
      )}
    </section>
  );
}