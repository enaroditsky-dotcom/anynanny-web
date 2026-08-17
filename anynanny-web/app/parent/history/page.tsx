"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

import {
  Calendar,
  Loader2,
  RefreshCw,
  Clock3,
  WalletCards,
  UserRound
} from "lucide-react";

import { useRouter } from "next/navigation";
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
  formatNis,
  formatShiftTime,
  resolveCompletedShiftAmount,
  resolveSessionForBooking,
  SESSION_HISTORY_SELECT_ATTEMPTS,
  sessionEndValue,
  sessionStartValue,
  type HistorySessionRow
} from "@/lib/session/completed-shift-history";

type NannyShiftHistoryItem = {
  id: string;
  nanny_id: string;
  nanny_name: string;

  date: string;
  raw_date: string;

  time_range: string;

  total_cost: number | null;

  status: string;
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
  session: HistorySessionRow | null | undefined
): string {
  const status = String(bookingStatus ?? "").trim().toLowerCase();

  if (status === "completed") return "שולם";
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
          const bookingsResult =
            await supabase
              .from("bookings")
              .select(`
                id,
                sitter_id,
                booking_date,
                start_time,
                end_time,
                status,
                hourly_rate_nis,
                sitter_profiles (
                  nanny_serial,
                  nanny_id_number,
                  hourly_rate_nis
                ),
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
              );

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

          if (error) {
            console.warn(
              "History: DB Response Error:",
              error.message
            );

            setShifts([]);

            return;
          }

          if (
            sessionReadError
          ) {
            console.warn(
              "History: Could not load session totals:",
              sessionReadError
            );
          }

          if (
            data &&
            data.length > 0
          ) {
            const formatted =
              data.map(
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

                  const profilesObj =
                    Array.isArray(
                      booking.sitter_profiles
                    )
                      ? booking
                          .sitter_profiles[0]
                      : booking.sitter_profiles;

                  const nameRow =
                    Array.isArray(
                      booking.profiles
                    )
                      ? booking
                          .profiles[0]
                      : booking.profiles;

                  const nannyName =
                    String(
                      nameRow?.first_name ??
                        ""
                    ).trim() ||
                    "שמרטפית AnyNanny";

                  const publicNannyId =
                    pickProfilePublicId(
                      profilesObj,
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
                          profilesObj?.hourly_rate_nis,

                        allowCalculation:
                          booking.status ===
                          "completed"
                      }
                    );

                  let statusLabel = parentHistoryStatusLabel(
                    String(booking.status ?? ""),
                    session
                  );

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
                      statusLabel
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
      className="w-full space-y-4 px-4 pb-4 pt-2"
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
          className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-40"
          aria-label="רענון היסטוריית משמרות"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${
              loadingData
                ? "animate-spin"
                : ""
            }`}
          />
        </button>
      </div>

      <div className="text-center">
        <h1 className="text-sm font-extrabold text-navy-header">
          היסטוריית משמרות
        </h1>
      </div>

      <div className="mx-auto max-w-sm space-y-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-1 pr-1 text-[12px] font-bold text-slate-400">
          <Calendar className="h-3 w-3" />

          <span>
            סינון לפי טווח תאריכים
          </span>
        </div>

        <div>
          <label
            htmlFor="history-date-filter"
            className="mb-0.5 block pr-1 text-[11px] text-slate-400"
          >
            בחירת טווח
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
              className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-8 pr-3 text-[13px] font-semibold text-slate-700"
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
                className="h-3.5 w-3.5 fill-current"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
              >
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
              </svg>
            </div>
          </div>
        </div>

        {filterMode ===
        "custom" ? (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-0.5 block pr-1 text-[11px] text-slate-400">
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
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-2 py-1.5 text-center text-[13px] text-slate-700"
                style={{
                  direction:
                    "ltr"
                }}
              />
            </div>

            <div>
              <label className="mb-0.5 block pr-1 text-[11px] text-slate-400">
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
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-2 py-1.5 text-center text-[13px] text-slate-700"
                style={{
                  direction:
                    "ltr"
                }}
              />
            </div>
          </div>
        ) : (
          <p className="pr-1 text-[12px] tabular-nums text-slate-500">
            מציג משמרות מ-
            {activeRange.start
              .split("-")
              .reverse()
              .join("/")}{" "}
            עד{" "}
            {activeRange.end
              .split("-")
              .reverse()
              .join("/")}
          </p>
        )}
      </div>

      <section className="mx-auto max-w-2xl space-y-2.5">
        <div>
          {loadingData ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-slate-500" />

              <p className="text-[13px]">
                טוען נתונים...
              </p>
            </div>
          ) : filteredShifts.length ===
            0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              לא נמצאו משמרות
              בטווח שנבחר
            </div>
          ) : (
            filteredShifts.map(
              (shift) => (
                <div
                  key={
                    shift.id
                  }
                  className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <div className="text-[15px] font-extrabold tabular-nums text-slate-800">
                      {
                        shift.date
                      }
                    </div>

                    <span
                      className={`rounded-full px-2 py-1 text-[12px] font-bold ${
                        shift.status ===
                        "שולם"
                          ? "bg-emerald-50 text-emerald-700"
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

                  <div className="grid grid-cols-3 gap-2">
                    <div className="min-w-0 rounded-xl bg-violet-50/70 p-2.5">
                      <div className="mb-1 flex items-center gap-1 text-[12px] font-bold text-violet-500">
                        <UserRound className="h-3.5 w-3.5" />

                        שמרטפית
                      </div>

                      <div className="truncate text-[14px] font-extrabold text-slate-800">
                        {
                          shift.nanny_name
                        }
                      </div>

                      <div
                        className="mt-0.5 truncate font-mono text-[12px] font-semibold text-violet-600"
                        dir="ltr"
                      >
                        {
                          shift.nanny_id
                        }
                      </div>
                    </div>

                    <div className="min-w-0 rounded-xl bg-blue-50/70 p-2.5">
                      <div className="mb-1 flex items-center gap-1 text-[12px] font-bold text-blue-500">
                        <Clock3 className="h-3.5 w-3.5" />

                        שעות
                      </div>

                      <div
                        className="whitespace-nowrap text-[14px] font-extrabold tabular-nums text-slate-800"
                        dir="ltr"
                      >
                        {
                          shift.time_range
                        }
                      </div>
                    </div>

                    <div className="min-w-0 rounded-xl bg-emerald-50/70 p-2.5">
                      <div className="mb-1 flex items-center gap-1 text-[12px] font-bold text-emerald-600">
                        <WalletCards className="h-3.5 w-3.5" />

                        סה״כ
                      </div>

                      <div className="whitespace-nowrap text-[15px] font-extrabold tabular-nums text-emerald-700">
                        {formatNis(
                          shift.total_cost
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            )
          )}
        </div>
      </section>
    </div>
  );
}