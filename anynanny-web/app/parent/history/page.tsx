"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

import {
  Calendar,
  FileSearch,
  Filter,
  Loader2,
  RefreshCw,
  Clock3,
  WalletCards,
  UserRound
} from "lucide-react";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageBackButton } from "@/components/navigation/page-back-link";

import {
  removeRealtimeChannel,
  subscribePostgresChanges
} from "@/lib/supabase/subscribe-postgres-changes";

import {
  getSupabaseBrowserClient
} from "@/lib/supabase/client";

import {
  pickProfilePublicId
} from "@/lib/public/sequential-display-id";
import {
  fetchPublicSitterProfilesViaRpc,
  publicSitterDisplayName
} from "@/lib/sitter/fetch-parent-sitter-profile";

import {
  formatNis,
  formatShiftTime,
  resolveCompletedShiftAmount,
  resolveSessionForBooking,
  SESSION_HISTORY_SELECT_ATTEMPTS,
  sessionEndValue,
  sessionStartValue,
  type HistorySessionRow
} from "@/lib/session/completed-shift-history";
import {
  CANCELLATION_COPY,
  cancellationHistoryLabel,
  formatCancellationDateTime,
  formatStoredCancellationMessage,
  isCancellationColumnMissing,
  pickCancellationFields,
  withCancellationSelect
} from "@/lib/bookings/cancellation-request";
import { STUCK_SHIFT_REVIEW_LABEL } from "@/lib/bookings/stuck-shift-review";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
import {
  BOOKING_PAYMENT_STATUS_LABELS,
  parentCompletedShiftPaymentActionLabel,
  parentPaymentRecoveryHref,
  resolveBookingPaymentDisplayKind,
  type BookingPaymentDisplayKind
} from "@/lib/bookings/payment-status-label";

type NannyShiftHistoryItem = {
  id: string;
  nanny_id: string;
  nanny_name: string;

  date: string;
  raw_date: string;

  time_range: string;

  total_cost: number | null;

  status: string;
  paymentKind?: BookingPaymentDisplayKind | null;
  paymentActionLabel?: string | null;
  cancellation_label?: string | null;
  cancellation_message?: string | null;
  cancelled_at_label?: string | null;
};

type DateFilterMode =
  | "last_week"
  | "last_month"
  | "last_year"
  | "custom";

/**
 * History badge labels.
 * "בפעילות" only when a real open session exists for a live booking status.
 */
function parentHistoryStatusLabel(
  bookingStatus: string,
  session: HistorySessionRow | null | undefined,
  requiresAdminReview?: boolean | null,
  payment?: { paymentStatus?: string | null; paidAt?: string | null }
): string {
  if (requiresAdminReview === true) return STUCK_SHIFT_REVIEW_LABEL;

  const status = String(bookingStatus ?? "").trim().toLowerCase();

  if (status === "completed") {
    return BOOKING_PAYMENT_STATUS_LABELS[
      resolveBookingPaymentDisplayKind({
        paymentStatus: payment?.paymentStatus,
        paidAt: payment?.paidAt
      })
    ];
  }
  if (status === "rejected") return "נדחתה";
  if (status === "cancelled") return "בוטלה";
  if (status === "pending") return "ממתינה לאישור";
  if (status === "approved") return "מאושרת";

  const sessionStarted = Boolean(session && sessionStartValue(session));
  const sessionEnded = Boolean(session && sessionEndValue(session));
  const openLiveSession = sessionStarted && !sessionEnded;

  if (
    openLiveSession &&
    (status === "parent_started" || status === "sitter_started")
  ) {
    return "בפעילות";
  }

  if (status === "parent_started" || status === "sitter_ended") {
    return "ממתין לאישור";
  }

  if (status === "sitter_started") {
    return "מאושרת";
  }

  return status || "מאושרת";
}

function toIsoDate(
  date: Date
): string {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function startOfLocalDay(
  isoDate: string
): number {
  const [
    year,
    month,
    day
  ] =
    isoDate
      .split("-")
      .map(Number);

  if (
    !year ||
    !month ||
    !day
  ) {
    return Number.NaN;
  }

  return new Date(
    year,
    month - 1,
    day,
    0,
    0,
    0,
    0
  ).getTime();
}

function endOfLocalDay(
  isoDate: string
): number {
  const [
    year,
    month,
    day
  ] =
    isoDate
      .split("-")
      .map(Number);

  if (
    !year ||
    !month ||
    !day
  ) {
    return Number.NaN;
  }

  return new Date(
    year,
    month - 1,
    day,
    23,
    59,
    59,
    999
  ).getTime();
}

function resolvePresetRange(
  mode: Exclude<
    DateFilterMode,
    "custom"
  >
): {
  start: string;
  end: string;
} {
  const end =
    new Date();

  const start =
    new Date();

  if (
    mode ===
    "last_week"
  ) {
    start.setDate(
      end.getDate() - 7
    );
  } else if (
    mode ===
    "last_month"
  ) {
    start.setMonth(
      end.getMonth() - 1
    );
  } else {
    start.setFullYear(
      end.getFullYear() - 1
    );
  }

  return {
    start:
      toIsoDate(start),

    end:
      toIsoDate(end)
  };
}

export default function ParentHistoryPage() {
  const supabase =
    getSupabaseBrowserClient();

  const router =
    useRouter();

  const [
    shifts,
    setShifts
  ] =
    useState<
      NannyShiftHistoryItem[]
    >([]);

  const [
    filterMode,
    setFilterMode
  ] =
    useState<DateFilterMode>(
      "last_month"
    );

  const [
    startDate,
    setStartDate
  ] =
    useState<string>("");

  const [
    endDate,
    setEndDate
  ] =
    useState<string>("");

  const [
    loadingData,
    setLoadingData
  ] =
    useState<boolean>(
      true
    );

  const [
    parentId,
    setParentId
  ] =
    useState<
      string | null
    >(null);

  const fetchShiftHistory =
    useCallback(
      async (
        resolvedParentId: string
      ) => {
        if (!supabase) {
          return;
        }

        try {
          setLoadingData(true);

          /*
           * BOOKINGS
           *
           * hourly_rate_nis is included here because it is
           * the booking-time snapshot of the sitter's rate.
           *
           * This is safer than relying only on the sitter's
           * current profile price.
           */
          const historySelect = withCancellationSelect(`
                id,
                sitter_id,
                booking_date,
                start_time,
                end_time,
                status,
                hourly_rate_nis,
                requires_admin_review,
                payment_status,
                paid_at,
                profiles:sitter_id (
                  first_name
                )
              `);

          let bookingsResult: {
            data: unknown;
            error: { message: string } | null;
          } =
            (await supabase
              .from("bookings")
              .select(historySelect)
              .eq(
                "parent_id",
                resolvedParentId
              )
              .order(
                "booking_date",
                {
                  ascending: false
                }
              )) as {
              data: unknown;
              error: { message: string } | null;
            };

          if (
            bookingsResult.error &&
            isCancellationColumnMissing(bookingsResult.error.message)
          ) {
            bookingsResult =
              (await supabase
                .from("bookings")
                .select(`
                id,
                sitter_id,
                booking_date,
                start_time,
                end_time,
                status,
                hourly_rate_nis,
                requires_admin_review,
                payment_status,
                paid_at,
                profiles:sitter_id (
                  first_name
                )
              `)
                .eq(
                  "parent_id",
                  resolvedParentId
                )
                .order(
                  "booking_date",
                  {
                    ascending: false
                  }
                )) as {
                data: unknown;
                error: { message: string } | null;
              };
          }

          if (
            bookingsResult.error &&
            isPostgrestMissingColumnError(
              bookingsResult.error.message,
              "requires_admin_review"
            )
          ) {
            bookingsResult =
              (await supabase
                .from("bookings")
                .select(`
                id,
                sitter_id,
                booking_date,
                start_time,
                end_time,
                status,
                hourly_rate_nis,
                payment_status,
                paid_at,
                profiles:sitter_id (
                  first_name
                )
              `)
                .eq(
                  "parent_id",
                  resolvedParentId
                )
                .order(
                  "booking_date",
                  {
                    ascending: false
                  }
                )) as {
                data: unknown;
                error: { message: string } | null;
              };
          }

          if (
            bookingsResult.error &&
            (
              isPostgrestMissingColumnError(
                bookingsResult.error.message,
                "payment_status"
              ) ||
              isPostgrestMissingColumnError(
                bookingsResult.error.message,
                "paid_at"
              )
            )
          ) {
            bookingsResult =
              (await supabase
                .from("bookings")
                .select(`
                id,
                sitter_id,
                booking_date,
                start_time,
                end_time,
                status,
                hourly_rate_nis,
                requires_admin_review,
                profiles:sitter_id (
                  first_name
                )
              `)
                .eq(
                  "parent_id",
                  resolvedParentId
                )
                .order(
                  "booking_date",
                  {
                    ascending: false
                  }
                )) as {
                data: unknown;
                error: { message: string } | null;
              };
          }

          /*
           * SESSIONS
           *
           * Source of truth for actual shift execution:
           * - real start
           * - real end
           * - real elapsed time
           * - real settlement amount
           *
           * We retain several SELECT fallbacks for compatibility
           * with older database schemas.
           */
          let sessionRows:
            HistorySessionRow[] =
            [];

          let sessionReadError:
            | string
            | null = null;

          for (
            const select
            of SESSION_HISTORY_SELECT_ATTEMPTS
          ) {
            const result =
              await supabase
                .from(
                  "sessions"
                )
                .select(
                  select
                )
                .eq(
                  "parent_id",
                  resolvedParentId
                )
                .order(
                  "created_at",
                  {
                    ascending:
                      false
                  }
                );

            if (
              !result.error
            ) {
              sessionRows =
                (result.data ??
                  []) as unknown as HistorySessionRow[];

              sessionReadError =
                null;

              break;
            }

            sessionReadError =
              result.error.message;
          }

          const {
            data,
            error
          } =
            bookingsResult;

          const bookingRows =
            (Array.isArray(data) ? data : []) as any[];

          if (error) {
            console.warn(
              "History: DB Response Error:",
              error.message
            );

            setShifts([]);

            return;
          }

          const publicSitters = await fetchPublicSitterProfilesViaRpc(
            supabase,
            bookingRows
              .map((row) => String(row?.sitter_id ?? "").trim())
              .filter(Boolean)
          );

          if (
            sessionReadError
          ) {
            console.warn(
              "History: Could not load session totals:",
              sessionReadError
            );
          }

          if (
            bookingRows.length > 0
          ) {
            const formatted =
              bookingRows.map(
                (
                  booking: any
                ) => {
                  let displayDate =
                    "ללא תאריך";

                  const rawDateStr =
                    booking.booking_date ||
                    "";

                  if (
                    booking.booking_date
                  ) {
                    const parts =
                      booking.booking_date.split(
                        "-"
                      );

                    if (
                      parts.length ===
                      3
                    ) {
                      displayDate =
                        `${parts[2]}/${parts[1]}/${parts[0].slice(
                          -2
                        )}`;
                    }
                  }

                  const publicSitter = publicSitters.get(
                    String(booking.sitter_id ?? "").trim()
                  );

                  const nameRow =
                    Array.isArray(
                      booking.profiles
                    )
                      ? booking
                          .profiles[0]
                      : booking.profiles;

                  const nannyName =
                    publicSitterDisplayName(publicSitter) ||
                    String(
                      nameRow?.first_name ??
                        ""
                    ).trim() ||
                    "שמרטפית AnyNanny";

                  const publicNannyId =
                    pickProfilePublicId(
                      publicSitter,
                      "sitter"
                    ) ||
                    "ללא מזהה";

                  /*
                   * Find the Session that belongs to this Booking.
                   *
                   * Explicit booking_id linkage is preferred.
                   * Legacy date/sitter matching is used only as fallback.
                   */
                  const session =
                    resolveSessionForBooking(
                      {
                        id:
                          booking.id,

                        sitter_id:
                          booking.sitter_id,

                        booking_date:
                          booking.booking_date,

                        start_time:
                          booking.start_time,

                        end_time:
                          booking.end_time
                      },
                      sessionRows
                    );

                  /*
                   * Actual execution times.
                   *
                   * Session wins.
                   * Scheduled Booking time is only a fallback.
                   */
                  const startTime =
                    formatShiftTime(
                      session
                        ? sessionStartValue(
                            session
                          )
                        : null
                    ) ??
                    formatShiftTime(
                      booking.start_time
                    );

                  const endTime =
                    formatShiftTime(
                      session
                        ? sessionEndValue(
                            session
                          )
                        : null
                    ) ??
                    formatShiftTime(
                      booking.end_time
                    );

                  /*
                   * Actual settlement amount.
                   *
                   * Priority:
                   * 1. amount stored in Session
                   * 2. actual Session duration calculation
                   * 3. booking-time hourly rate snapshot
                   *
                   * Current profile rate is only a compatibility fallback.
                   */
                  const totalCost =
                    resolveCompletedShiftAmount(
                      {
                        session,

                        bookingStart:
                          booking.start_time,

                        bookingEnd:
                          booking.end_time,

                        bookingDate:
                          booking.booking_date,

                        sitterHourlyRate:
                          booking.hourly_rate_nis ??
                          publicSitter?.hourly_rate_nis,

                        allowCalculation:
                          booking.status ===
                          "completed"
                      }
                    );

                  let statusLabel = parentHistoryStatusLabel(
                    String(booking.status ?? ""),
                    session,
                    booking.requires_admin_review === true,
                    {
                      paymentStatus: booking.payment_status,
                      paidAt: booking.paid_at
                    }
                  );

                  const cancellation = pickCancellationFields(
                    booking as Record<string, unknown>
                  );
                  const cancellationLabel =
                    booking.requires_admin_review === true
                      ? null
                      : String(booking.status ?? "").trim().toLowerCase() === "cancelled"
                      ? cancellationHistoryLabel(cancellation.cancellationRequestedRole)
                      : null;

                  if (cancellationLabel) {
                    statusLabel = cancellationLabel;
                  }

                  const bookingStatus = String(booking.status ?? "").trim().toLowerCase();
                  const isCompletedUnreviewed =
                    bookingStatus === "completed" &&
                    booking.requires_admin_review !== true &&
                    !cancellationLabel;
                  const paymentKind = isCompletedUnreviewed
                    ? resolveBookingPaymentDisplayKind({
                        paymentStatus: booking.payment_status,
                        paidAt: booking.paid_at
                      })
                    : null;
                  const paymentActionLabel = isCompletedUnreviewed
                    ? parentCompletedShiftPaymentActionLabel({
                        paymentStatus: booking.payment_status,
                        paidAt: booking.paid_at
                      })
                    : null;

                  return {
                    id:
                      booking.id,

                    nanny_id:
                      publicNannyId,

                    nanny_name:
                      nannyName,

                    date:
                      displayDate,

                    raw_date:
                      rawDateStr,

                    time_range:
                      startTime &&
                      endTime
                        ? `${startTime} - ${endTime}`
                        : "טרם נקבע",

                    total_cost:
                      totalCost,

                    status:
                      statusLabel,

                    paymentKind,
                    paymentActionLabel,

                    cancellation_label:
                      cancellationLabel,

                    cancellation_message:
                      cancellation.cancellationMessage,

                    cancelled_at_label:
                      formatCancellationDateTime(cancellation.cancelledAt)
                  };
                }
              );

            setShifts(
              formatted
            );
          } else {
            setShifts([]);
          }
        } catch (err) {
          console.error(
            "History: Request exception caught safely:",
            err
          );
        } finally {
          setLoadingData(
            false
          );
        }
      },
      [supabase]
    );

  /*
   * Initial load + Realtime.
   *
   * Both Booking and Session changes matter:
   * Booking controls lifecycle/status.
   * Session controls actual execution + settlement.
   */
  useEffect(() => {
    if (!supabase) {
      return;
    }

    const channels:
      ReturnType<
        typeof subscribePostgresChanges
      >[] = [];

    let cancelled =
      false;

    void supabase.auth
      .getUser()
      .then(
        ({
          data: authData,
          error
        }) => {
          if (cancelled) {
            return;
          }

          const targetParentId =
            authData.user?.id;

          if (
            error ||
            !targetParentId
          ) {
            setLoadingData(
              false
            );

            setShifts([]);

            return;
          }

          setParentId(
            targetParentId
          );

          void fetchShiftHistory(
            targetParentId
          );

          channels.push(
            subscribePostgresChanges(
              supabase,
              `history-realtime-${targetParentId}`,
              {
                event: "*",
                table:
                  "bookings",

                filter:
                  `parent_id=eq.${targetParentId}`,

                handler:
                  () =>
                    void fetchShiftHistory(
                      targetParentId
                    )
              }
            )
          );

          channels.push(
            subscribePostgresChanges(
              supabase,
              `history-sessions-realtime-${targetParentId}`,
              {
                event: "*",
                table:
                  "sessions",

                filter:
                  `parent_id=eq.${targetParentId}`,

                handler:
                  () =>
                    void fetchShiftHistory(
                      targetParentId
                    )
              }
            )
          );
        }
      );

    return () => {
      cancelled =
        true;

      for (
        const channel
        of channels
      ) {
        removeRealtimeChannel(
          supabase,
          channel
        );
      }
    };
  }, [
    fetchShiftHistory,
    supabase
  ]);

  const activeRange =
    useMemo(
      () => {
        if (
          filterMode ===
          "custom"
        ) {
          return {
            start:
              startDate,

            end:
              endDate
          };
        }

        return resolvePresetRange(
          filterMode
        );
      },
      [
        filterMode,
        startDate,
        endDate
      ]
    );

  const filteredShifts =
    useMemo(
      () => {
        return shifts.filter(
          (shift) => {
            if (
              !shift.raw_date
            ) {
              return (
                filterMode ===
                  "custom" &&
                !startDate &&
                !endDate
              );
            }

            const shiftTime =
              startOfLocalDay(
                shift.raw_date.slice(
                  0,
                  10
                )
              );

            if (
              !Number.isFinite(
                shiftTime
              )
            ) {
              return false;
            }

            if (
              activeRange.start
            ) {
              const startTime =
                startOfLocalDay(
                  activeRange.start
                );

              if (
                Number.isFinite(
                  startTime
                ) &&
                shiftTime <
                  startTime
              ) {
                return false;
              }
            }

            if (
              activeRange.end
            ) {
              const endTime =
                endOfLocalDay(
                  activeRange.end
                );

              if (
                Number.isFinite(
                  endTime
                ) &&
                shiftTime >
                  endTime
              ) {
                return false;
              }
            }

            return true;
          }
        );
      },
      [
        shifts,
        filterMode,
        startDate,
        endDate,
        activeRange.start,
        activeRange.end
      ]
    );

  return (
    <div
      className="mx-auto w-full min-w-0 max-w-md space-y-5 pb-4 pt-1"
      dir="rtl"
    >
      <div className="flex items-center justify-between gap-3" dir="ltr">
        <PageBackButton onClick={() => router.push("/parent/dashboard")} />
        <button
          type="button"
          onClick={() =>
            parentId &&
            fetchShiftHistory(
              parentId
            )
          }
          disabled={
            !parentId ||
            loadingData
          }
          className="p-1.5 text-slate-400 hover:text-slate-600 disabled:opacity-40"
          aria-label="רענון היסטוריית משמרות"
        >
          <RefreshCw
            className={`h-4 w-4 ${
              loadingData
                ? "animate-spin"
                : ""
            }`}
          />
        </button>
      </div>

      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-header">
          היסטוריית משמרות
        </h1>
        <p className="mx-auto mt-2 max-w-[22rem] text-sm font-normal leading-relaxed text-slate-500">
          צפו בכל המשמרות שלכם, סננו לפי תאריכים
          <br />
          וגלו כל פרט במקום אחד.
        </p>
      </header>

      <div className="w-full min-w-0 space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft">
        <div className="flex items-center gap-2 text-base font-semibold text-navy-header">
          <Filter className="h-4 w-4 shrink-0 text-navy-header/70" aria-hidden />
          <span>סינון לפי טווח תאריכים</span>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="history-date-filter"
            className="block text-sm font-normal text-slate-600"
          >
            בחר/י טווח
          </label>

          <div className="relative">
            <select
              id="history-date-filter"
              value={
                filterMode
              }
              onChange={(e) =>
                setFilterMode(
                  e.target
                    .value as DateFilterMode
                )
              }
              className="min-h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50/80 py-3 pl-10 pr-3 text-base font-medium text-navy-header"
            >
              <option value="last_week">
                שבוע אחרון
              </option>

              <option value="last_month">
                חודש אחרון
              </option>

              <option value="last_year">
                שנה אחרונה
              </option>

              <option value="custom">
                בין התאריכים
              </option>
            </select>

            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <svg
                className="h-4 w-4 fill-current"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                aria-hidden
              >
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
              </svg>
            </div>
          </div>
        </div>

        {filterMode ===
        "custom" ? (
          <div className="grid min-w-0 grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="mb-1.5 block text-sm font-normal text-slate-600">
                מתאריך
              </label>

              <input
                type="date"
                value={
                  startDate
                }
                onChange={(
                  e
                ) =>
                  setStartDate(
                    e.target
                      .value
                  )
                }
                className="min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50/80 px-2 py-2.5 text-center text-sm text-navy-header"
                style={{
                  direction:
                    "ltr"
                }}
              />
            </div>

            <div className="min-w-0">
              <label className="mb-1.5 block text-sm font-normal text-slate-600">
                עד תאריך
              </label>

              <input
                type="date"
                value={
                  endDate
                }
                onChange={(
                  e
                ) =>
                  setEndDate(
                    e.target
                      .value
                  )
                }
                className="min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50/80 px-2 py-2.5 text-center text-sm text-navy-header"
                style={{
                  direction:
                    "ltr"
                }}
              />
            </div>
          </div>
        ) : (
          <p className="flex items-start gap-2 text-sm font-normal leading-relaxed text-slate-500">
            <Calendar
              className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
              aria-hidden
            />
            <span>
              מציג משמרות מ־
              <span className="font-semibold tabular-nums text-emerald-600">
                {activeRange.start
                  .split("-")
                  .reverse()
                  .join("/")}
              </span>
              {" "}עד{" "}
              <span className="font-semibold tabular-nums text-emerald-600">
                {activeRange.end
                  .split("-")
                  .reverse()
                  .join("/")}
              </span>
            </span>
          </p>
        )}
      </div>

      <section className="w-full min-w-0">
        {loadingData ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-5 py-12 text-slate-500 shadow-soft">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            <p className="text-sm font-normal">
              טוען נתונים...
            </p>
          </div>
        ) : filteredShifts.length ===
          0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-5 py-12 text-center shadow-soft">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
              <FileSearch className="h-7 w-7" aria-hidden />
            </div>
            <p className="text-base font-semibold text-navy-header">
              לא נמצאו משמרות בטווח שנבחר
            </p>
            <p className="max-w-[18rem] text-sm font-normal leading-relaxed text-slate-500">
              נסו לשנות את טווח התאריכים או לבדוק מאוחר יותר.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredShifts.map(
              (shift) => (
                <div
                  key={
                    shift.id
                  }
                  className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="text-base font-semibold tabular-nums text-navy-header">
                      {
                        shift.date
                      }
                    </div>

                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        shift.paymentKind === "paid" ||
                        shift.status ===
                        "שולם"
                          ? "bg-emerald-50 text-emerald-700"
                          : shift.cancellation_label
                            ? "bg-rose-50 text-rose-700"
                          : shift.paymentKind === "pending_checkout"
                            ? "bg-rose-50 text-rose-800"
                          : shift.paymentKind === "unpaid"
                            ? "bg-amber-50 text-amber-800"
                          : shift.status ===
                              "ממתין לאישור"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {
                        shift.status
                      }
                    </span>
                  </div>

                  <div className="grid min-w-0 grid-cols-3 gap-2">
                    <div className="min-w-0 rounded-xl bg-violet-50/70 p-2.5">
                      <div className="mb-1 flex items-center gap-1 text-xs font-medium text-violet-500">
                        <UserRound className="h-3.5 w-3.5 shrink-0" />

                        שמרטפית
                      </div>

                      <div className="truncate text-sm font-semibold text-navy-header">
                        {
                          shift.nanny_name
                        }
                      </div>

                      <div
                        className="mt-0.5 truncate font-mono text-xs font-medium text-violet-600"
                        dir="ltr"
                      >
                        {
                          shift.nanny_id
                        }
                      </div>
                    </div>

                    <div className="min-w-0 rounded-xl bg-blue-50/70 p-2.5">
                      <div className="mb-1 flex items-center gap-1 text-xs font-medium text-blue-500">
                        <Clock3 className="h-3.5 w-3.5 shrink-0" />

                        שעות
                      </div>

                      <div
                        className="whitespace-nowrap text-sm font-semibold tabular-nums text-navy-header"
                        dir="ltr"
                      >
                        {
                          shift.time_range
                        }
                      </div>
                    </div>

                    <div className="min-w-0 rounded-xl bg-emerald-50/70 p-2.5">
                      <div className="mb-1 flex items-center gap-1 text-xs font-medium text-emerald-600">
                        <WalletCards className="h-3.5 w-3.5 shrink-0" />

                        סה״כ
                      </div>

                      <div className="whitespace-nowrap text-sm font-semibold tabular-nums text-emerald-700">
                        {formatNis(
                          shift.total_cost
                        )}
                      </div>
                    </div>
                  </div>

                  {formatStoredCancellationMessage(shift.cancellation_message) ? (
                    <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-right text-xs leading-relaxed text-rose-900">
                      <span className="font-semibold">{CANCELLATION_COPY.messageHistoryLabel}: </span>
                      {formatStoredCancellationMessage(shift.cancellation_message)}
                    </p>
                  ) : null}
                  {shift.cancelled_at_label ? (
                    <p className="mt-1 text-right text-[11px] tabular-nums text-slate-500">
                      בוטל ב־{shift.cancelled_at_label}
                    </p>
                  ) : null}
                  {shift.paymentActionLabel ? (
                    <Link
                      href={parentPaymentRecoveryHref(shift.id)}
                      className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[#001F3F] px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110"
                    >
                      {shift.paymentActionLabel}
                    </Link>
                  ) : null}
                </div>
              )
            )}
          </div>
        )}
      </section>
    </div>
  );
}