"use client";

import React, {
  useCallback,
  useEffect,
  useState
} from "react";

import { useAuth } from "@/components/auth-provider";

import { BookingCalendarPanel } from "@/components/bookings/booking-calendar-panel";

import type {
  CalendarShift
} from "@/components/bookings/booking-calendar-views";

import { SitterPageShell } from "@/components/sitter/sitter-page-shell";
import { SitterParentProfilePreview } from "@/components/sitter/sitter-parent-profile-preview";

import {
  BOOKINGS_TABLE,
  type BookingStatus
} from "@/lib/bookings/constants";

import { resolveBookingWindowMs } from "@/lib/bookings/booking-date-utils";

import {
  resolveShiftTimeWindow,
  sitterHasOverlappingActiveShift,
  SITTER_OVERLAP_APPROVE_MESSAGE
} from "@/lib/bookings/sitter-shift-overlap";

import {
  formatBookingSchedule,
  updateBookingStatus
} from "@/lib/bookings/sitter-pending-bookings";

import {
  formatParentProfileAddress
} from "@/lib/bookings/todays-linked-booking";

import {
  normalizeBookingStatus
} from "@/lib/bookings/use-shift-activation-status";

import {
  formatNis,
  formatShiftDate,
  formatShiftTime,
  resolveCompletedShiftAmount,
  resolveSessionForBooking,
  SESSION_HISTORY_SELECT_ATTEMPTS,
  sessionEndValue,
  sessionStartValue,
  type HistorySessionRow
} from "@/lib/session/completed-shift-history";

import {
  getSupabaseBrowserClient
} from "@/lib/supabase/client";

import {
  isPostgrestMissingColumnError
} from "@/lib/supabase/postgrest-schema";

import {
  PROFILES_TABLE
} from "@/lib/supabase/profiles";

import {
  removeRealtimeChannel,
  subscribePostgresChanges
} from "@/lib/supabase/subscribe-postgres-changes";

import {
  Clock3,
  MapPin,
  UserRound,
  WalletCards
} from "lucide-react";

/**
 * DB may store legacy `confirmed`;
 * normalized in app as `approved`.
 */
const SITTER_CALENDAR_CONFIRMED_STATUSES = [
  "approved",
  "confirmed"
] as const;

interface BookingRow {
  id: string;
  parent_id: string;
  sitter_id?: string | null;

  booking_date: string;

  start_time: string;
  end_time: string;

  status: string;

  hourly_rate_nis?: number | null;
}

interface Shift {
  id: string;

  parent_name: string;
  parent_id: string;

  start_time_label: string;
  start_date_label: string;

  end_time_label: string;
  end_date_label: string;

  status: string;

  address: string;

  booking_date: string;
  start_time: string;
  end_time: string;

  total_amount_nis: number | null;
}

type ViewType =
  | "pending"
  | "calendar"
  | "past";

function formatDateHe(
  dateStr: string
): string {
  if (!dateStr) {
    return "";
  }

  const [
    year,
    month,
    day
  ] = dateStr
    .slice(0, 10)
    .split("-");

  return `${day}/${month}/${year}`;
}

function isoDateFromMs(
  ms: number
): string {
  const d = new Date(ms);

  return `${d.getFullYear()}-${String(
    d.getMonth() + 1
  ).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * מתוכנן:
 * משמש Pending/Calendar בלבד.
 */
function resolveShiftScheduleLabels(
  booking: Pick<
    BookingRow,
    | "booking_date"
    | "start_time"
    | "end_time"
  >
): Pick<
  Shift,
  | "start_time_label"
  | "start_date_label"
  | "end_time_label"
  | "end_date_label"
> {
  const window =
    resolveBookingWindowMs(
      booking
    );

  const fallbackDate =
    formatDateHe(
      booking.booking_date
    );

  if (!window) {
    return {
      start_time_label:
        "--:--",

      start_date_label:
        fallbackDate,

      end_time_label:
        "--:--",

      end_date_label:
        fallbackDate
    };
  }

  const timeFmt:
    Intl.DateTimeFormatOptions =
    {
      hour: "2-digit",
      minute: "2-digit"
    };

  return {
    start_time_label:
      new Date(
        window.startMs
      ).toLocaleTimeString(
        "he-IL",
        timeFmt
      ),

    start_date_label:
      formatDateHe(
        booking.booking_date.slice(
          0,
          10
        )
      ),

    end_time_label:
      new Date(
        window.endMs
      ).toLocaleTimeString(
        "he-IL",
        timeFmt
      ),

    end_date_label:
      formatDateHe(
        isoDateFromMs(
          window.endMs
        )
      )
  };
}

function statusBadge(
  status: string,
  viewType: ViewType
): {
  label: string;
  className: string;
} {
  if (status === "pending") {
    return {
      label:
        "ממתינה לאישור",

      className:
        "bg-rose-50 text-rose-700"
    };
  }

  if (
    viewType === "past" ||
    status === "completed"
  ) {
    return {
      label: "בוצעה",

      className:
        "bg-emerald-50 text-emerald-700"
    };
  }

  if (
    status === "approved" ||
    status === "confirmed"
  ) {
    return {
      label: "מאושרת",

      className:
        "bg-emerald-50 text-emerald-700"
    };
  }

  return {
    label: "עתידית",

    className:
      "bg-amber-50 text-amber-700"
  };
}

async function loadParentDetailsByIds(
  supabase: NonNullable<
    ReturnType<
      typeof getSupabaseBrowserClient
    >
  >,
  parentIds: string[]
): Promise<{
  names: Map<string, string>;
  addresses: Map<string, string>;
}> {
  const names =
    new Map<
      string,
      string
    >();

  const addresses =
    new Map<
      string,
      string
    >();

  if (
    parentIds.length === 0
  ) {
    return {
      names,
      addresses
    };
  }

  let profileRows:
    | Array<
        Record<
          string,
          unknown
        >
      >
    | null = null;

  const withAddress =
    await supabase
      .from(
        PROFILES_TABLE
      )
      .select(
        "id, first_name, last_name, address"
      )
      .in(
        "id",
        parentIds
      );

  if (withAddress.error) {
    if (
      isPostgrestMissingColumnError(
        withAddress.error.message,
        "address"
      ) ||
      /column|schema cache|could not find/i.test(
        withAddress.error.message
      )
    ) {
      const fallback =
        await supabase
          .from(
            PROFILES_TABLE
          )
          .select(
            "id, first_name, last_name"
          )
          .in(
            "id",
            parentIds
          );

      if (fallback.error) {
        console.warn(
          "Could not load parent profiles for shifts:",
          fallback.error.message
        );

        return {
          names,
          addresses
        };
      }

      profileRows =
        (fallback.data as
          | Array<
              Record<
                string,
                unknown
              >
            >
          | null) ?? [];
    } else {
      console.warn(
        "Could not load parent profiles for shifts:",
        withAddress.error.message
      );

      return {
        names,
        addresses
      };
    }
  } else {
    profileRows =
      (withAddress.data as
        | Array<
            Record<
              string,
              unknown
            >
          >
        | null) ?? [];
  }

  for (
    const profile
    of profileRows
  ) {
    const id =
      String(
        profile.id ?? ""
      );

    if (!id) {
      continue;
    }

    const name =
      `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();

    if (name) {
      names.set(
        id,
        name
      );
    }

    const address =
      formatParentProfileAddress(
        profile.address
      );

    if (address) {
      addresses.set(
        id,
        address
      );
    }
  }

  return {
    names,
    addresses
  };
}

export default function SitterShiftsPage() {
  const {
    user,
    isLoading:
      authLoading
  } = useAuth();

  const [
    viewType,
    setViewType
  ] =
    useState<ViewType>(
      "calendar"
    );

  const [
    shifts,
    setShifts
  ] = useState<Shift[]>([]);

  const [
    calendarShifts,
    setCalendarShifts
  ] =
    useState<
      CalendarShift[]
    >([]);

  const [
    loading,
    setLoading
  ] = useState(true);

  const [
    calendarLoading,
    setCalendarLoading
  ] = useState(false);

  const [
    actingId,
    setActingId
  ] =
    useState<
      string | null
    >(null);

  const [
    actionMessage,
    setActionMessage
  ] =
    useState<
      string | null
    >(null);

  const [
    actionError,
    setActionError
  ] =
    useState<
      string | null
    >(null);

  const fetchListShifts =
    useCallback(
      async () => {
        const sitterId =
          user?.id;

        if (!sitterId) {
          setShifts([]);
          setLoading(false);
          return;
        }

        setLoading(true);

        try {
          const supabase =
            getSupabaseBrowserClient();

          if (!supabase) {
            setShifts([]);
            return;
          }

          let query =
            supabase
              .from(
                BOOKINGS_TABLE
              )
              .select(
                [
                  "id",
                  "parent_id",
                  "sitter_id",
                  "booking_date",
                  "start_time",
                  "end_time",
                  "status",
                  "hourly_rate_nis"
                ].join(", ")
              )
              .eq(
                "sitter_id",
                sitterId
              );

          if (
            viewType ===
            "pending"
          ) {
            query =
              query.eq(
                "status",
                "pending"
              );
          } else {
            query =
              query.eq(
                "status",
                "completed"
              );
          }

          const {
            data,
            error
          } =
            await query.order(
              "booking_date",
              {
                ascending:
                  viewType ===
                  "pending"
              }
            );

          if (error) {
            throw error;
          }

          const bookingRows =
            (data ??
              []) as unknown as BookingRow[];

          const parentIds = [
            ...new Set(
              bookingRows
                .map(
                  (row) =>
                    row.parent_id
                )
                .filter(Boolean)
            )
          ];

          const {
            names:
              parentNameById,
            addresses:
              parentAddressById
          } =
            await loadParentDetailsByIds(
              supabase,
              parentIds
            );

          let sessionRows:
            HistorySessionRow[] =
            [];

          /*
           * רק History צריך Sessions.
           *
           * Pending ממשיך לעבוד על
           * השעות המתוכננות.
           */
          if (
            viewType ===
            "past"
          ) {
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
                    "sitter_id",
                    sitterId
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

            if (
              sessionReadError
            ) {
              console.warn(
                "[sitter shifts] Could not load session history:",
                sessionReadError
              );
            }
          }

          const formattedShifts:
            Shift[] =
            bookingRows.map(
              (booking) => {
                /*
                 * Pending:
                 * שעות מתוכננות.
                 */
                if (
                  viewType !==
                  "past"
                ) {
                  return {
                    id:
                      booking.id,

                    parent_id:
                      booking.parent_id,

                    parent_name:
                      parentNameById.get(
                        booking.parent_id
                      ) ??
                      "הורה AnyNanny",

                    ...resolveShiftScheduleLabels(
                      booking
                    ),

                    status:
                      booking.status,

                    booking_date:
                      booking.booking_date,

                    start_time:
                      booking.start_time,

                    end_time:
                      booking.end_time,

                    // Pending: never surface full address on the card.
                    // Parent preview (and approved bookings) own that disclosure.
                    address:
                      normalizeBookingStatus(
                        booking.status as BookingStatus
                      ) === "pending"
                        ? ""
                        : parentAddressById.get(
                            booking.parent_id
                          ) ?? "",

                    total_amount_nis:
                      null
                  };
                }

                /*
                 * Past:
                 * Source of Truth = Session.
                 */
                const session =
                  resolveSessionForBooking(
                    booking,
                    sessionRows
                  );

                const actualStart =
                  session
                    ? sessionStartValue(
                        session
                      )
                    : null;

                const actualEnd =
                  session
                    ? sessionEndValue(
                        session
                      )
                    : null;

                const startLabel =
                  formatShiftTime(
                    actualStart ||
                      booking.start_time
                  ) ??
                  "--:--";

                const endLabel =
                  formatShiftTime(
                    actualEnd ||
                      booking.end_time
                  ) ??
                  "--:--";

                const startDate =
                  formatShiftDate(
                    actualStart
                  ) ??
                  formatDateHe(
                    booking.booking_date
                  );

                const endDate =
                  formatShiftDate(
                    actualEnd
                  ) ??
                  startDate;

                const totalAmount =
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
                        booking.hourly_rate_nis,

                      allowCalculation:
                        booking.status ===
                        "completed"
                    }
                  );

                return {
                  id:
                    booking.id,

                  parent_id:
                    booking.parent_id,

                  parent_name:
                    parentNameById.get(
                      booking.parent_id
                    ) ??
                    "הורה AnyNanny",

                  start_time_label:
                    startLabel,

                  start_date_label:
                    startDate,

                  end_time_label:
                    endLabel,

                  end_date_label:
                    endDate,

                  status:
                    booking.status,

                  booking_date:
                    booking.booking_date,

                  start_time:
                    booking.start_time,

                  end_time:
                    booking.end_time,

                  address:
                    parentAddressById.get(
                      booking.parent_id
                    ) ?? "",

                  total_amount_nis:
                    totalAmount
                };
              }
            );

          setShifts(
            formattedShifts
          );
        } catch (err) {
          console.error(
            "Error fetching shifts from Supabase:",
            err
          );
        } finally {
          setLoading(false);
        }
      },
      [
        user?.id,
        viewType
      ]
    );

  const fetchCalendarShifts =
    useCallback(
      async () => {
        const sitterId =
          user?.id;

        if (!sitterId) {
          setCalendarShifts(
            []
          );

          setCalendarLoading(
            false
          );

          return;
        }

        setCalendarLoading(
          true
        );

        try {
          const supabase =
            getSupabaseBrowserClient();

          if (!supabase) {
            setCalendarShifts(
              []
            );

            return;
          }

          const {
            data,
            error
          } =
            await supabase
              .from(
                BOOKINGS_TABLE
              )
              .select(
                "id, parent_id, booking_date, start_time, end_time, status"
              )
              .eq(
                "sitter_id",
                sitterId
              )
              .in(
                "status",
                [
                  ...SITTER_CALENDAR_CONFIRMED_STATUSES
                ]
              )
              .order(
                "booking_date",
                {
                  ascending:
                    true
                }
              )
              .order(
                "start_time",
                {
                  ascending:
                    true
                }
              );

          if (error) {
            throw error;
          }

          const bookingRows =
            (data ??
              []) as BookingRow[];

          const parentIds = [
            ...new Set(
              bookingRows
                .map(
                  (row) =>
                    row.parent_id
                )
                .filter(Boolean)
            )
          ];

          const {
            names:
              parentNameById,
            addresses:
              parentAddressById
          } =
            await loadParentDetailsByIds(
              supabase,
              parentIds
            );

          setCalendarShifts(
            bookingRows.map(
              (row) => ({
                id: row.id,

                partnerId:
                  row.parent_id,

                partnerName:
                  parentNameById.get(
                    row.parent_id
                  ) ??
                  "הורה AnyNanny",

                partnerAddress:
                  parentAddressById.get(
                    row.parent_id
                  ) ?? "",

                bookingDate:
                  row.booking_date,

                startTime:
                  row.start_time,

                endTime:
                  row.end_time,

                status:
                  normalizeBookingStatus(
                    row.status as BookingStatus
                  ) ??
                  "approved",

                scheduleLabel:
                  formatBookingSchedule(
                    row
                  )
              })
            )
          );
        } catch (err) {
          console.error(
            "Error fetching calendar shifts:",
            err
          );

          setCalendarShifts(
            []
          );
        } finally {
          setCalendarLoading(
            false
          );
        }
      },
      [user?.id]
    );

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (
      viewType ===
      "calendar"
    ) {
      void fetchCalendarShifts();

      return;
    }

    void fetchListShifts();
  }, [
    authLoading,
    viewType,
    fetchListShifts,
    fetchCalendarShifts
  ]);

  /*
   * History חייב להתעדכן גם כאשר
   * ה-Session משתנה, לא רק Booking.
   */
  useEffect(() => {
    const sitterId =
      user?.id;

    if (
      !sitterId ||
      authLoading
    ) {
      return;
    }

    const supabase =
      getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    const channels:
      ReturnType<
        typeof subscribePostgresChanges
      >[] = [];

    channels.push(
      subscribePostgresChanges(
        supabase,
        `sitter-shifts-bookings-${sitterId}`,
        {
          event: "*",
          table:
            BOOKINGS_TABLE,
          filter:
            `sitter_id=eq.${sitterId}`,

          handler: () => {
            if (
              viewType ===
              "calendar"
            ) {
              void fetchCalendarShifts();
            } else {
              void fetchListShifts();
            }
          }
        }
      )
    );

    channels.push(
      subscribePostgresChanges(
        supabase,
        `sitter-shifts-sessions-${sitterId}`,
        {
          event: "*",
          table:
            "sessions",
          filter:
            `sitter_id=eq.${sitterId}`,

          handler: () => {
            if (
              viewType ===
              "past"
            ) {
              void fetchListShifts();
            }
          }
        }
      )
    );

    return () => {
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
    user?.id,
    authLoading,
    viewType,
    fetchListShifts,
    fetchCalendarShifts
  ]);

  useEffect(() => {
    if (!actionMessage) {
      return;
    }

    const id =
      window.setTimeout(
        () =>
          setActionMessage(
            null
          ),
        4500
      );

    return () =>
      window.clearTimeout(
        id
      );
  }, [actionMessage]);

  const handleRespond =
    async (
      shift: Shift,
      status:
        | "approved"
        | "rejected"
    ) => {
      const sitterId =
        user?.id;

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

      if (
        status ===
        "approved"
      ) {
        const proposedWindow =
          resolveShiftTimeWindow(
            shift
          );

        if (proposedWindow) {
          const hasOverlap =
            await sitterHasOverlappingActiveShift(
              supabase,
              sitterId,
              proposedWindow,
              {
                bookingId:
                  shift.id
              }
            );

          if (hasOverlap) {
            setActionError(
              SITTER_OVERLAP_APPROVE_MESSAGE
            );

            return;
          }
        }
      }

      setActionError(null);
      setActingId(
        shift.id
      );

      const {
        error
      } =
        await updateBookingStatus(
          supabase,
          sitterId,
          shift.id,
          status
        );

      setActingId(null);

      if (error) {
        setActionError(
          error
        );

        void fetchListShifts();

        return;
      }

      setActionMessage(
        status === "approved"
          ? "המשמרת אושרה — ההורה יקבל עדכון"
          : "הבקשה נדחתה — ההורה יקבל עדכון"
      );

      void fetchListShifts();
    };

  const calendarProfileHref =
    useCallback(
      (
        shift:
          CalendarShift
      ) =>
        `/sitter/messages?parentId=${encodeURIComponent(
          shift.partnerId
        )}`,
      []
    );

  return (
    <SitterPageShell
      title="לוח המשמרות שלי"
      subtitle="בקשות ממתינות לאישור, יומן משמרות מאושרות והיסטוריית ביצוע בפועל."
    >
      <div
        className="mx-auto flex h-full min-h-0 w-full max-w-md flex-col text-right"
        dir="rtl"
      >
        <div className="mb-4 shrink-0">
          <label className="mb-2 mr-1 block text-xs font-bold uppercase text-gray-400">
            בחר סוג תצוגה
          </label>

          <div className="relative">
            <select
              value={
                viewType
              }
              onChange={(
                e
              ) => {
                setViewType(
                  e.target
                    .value as ViewType
                );

                setActionError(
                  null
                );
              }}
              className="w-full cursor-pointer appearance-none rounded-xl border border-gray-200 bg-white p-3.5 text-base font-semibold text-gray-700 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="pending">
                ⏳ ממתינות
                לאישור
              </option>

              <option value="calendar">
                📅 יומן משמרות
              </option>

              <option value="past">
                ✅ משמרות
                שבוצעו
              </option>
            </select>

            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-gray-500">
              <svg
                className="h-4 w-4 fill-current"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
              >
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
              </svg>
            </div>
          </div>
        </div>

        {actionMessage ? (
          <p
            role="status"
            className="mb-4 shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900"
          >
            {
              actionMessage
            }
          </p>
        ) : null}

        {actionError ? (
          <p
            role="alert"
            className="mb-4 shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900"
          >
            {
              actionError
            }
          </p>
        ) : null}

        {viewType ===
        "calendar" ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <BookingCalendarPanel
              shifts={
                calendarShifts
              }
              loading={
                calendarLoading ||
                authLoading
              }
              viewModeSelectId="sitter-shifts-calendar-view-mode"
              profileHref={
                calendarProfileHref
              }
              profileLinkLabel="צור קשר"
              className="h-full"
            />
          </div>
        ) : loading ||
          authLoading ? (
          <div className="py-10 text-center font-medium text-gray-400">
            מושך נתונים חיים
            מה-Database...
          </div>
        ) : shifts.length ===
          0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-10 text-center text-gray-400">
            אין משמרות
            רשומות בקטגוריה
            זו ב-Supabase.
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain">
            {shifts.map(
              (shift) => {
                const badge =
                  statusBadge(
                    shift.status,
                    viewType
                  );

                const isPending =
                  shift.status ===
                  "pending";

                /*
                 * HISTORY:
                 * תצוגה מקבילה ל-History
                 * של ההורה:
                 *
                 * הורה | שעות בפועל | סה"כ
                 */
                if (
                  viewType ===
                  "past"
                ) {
                  return (
                    <div
                      key={
                        shift.id
                      }
                      className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm"
                    >
                      <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <div className="text-[15px] font-extrabold tabular-nums text-slate-800">
                          {
                            shift.start_date_label
                          }
                        </div>

                        <span
                          className={`rounded-full px-2 py-1 text-[12px] font-bold ${badge.className}`}
                        >
                          {
                            badge.label
                          }
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="min-w-0 rounded-xl bg-violet-50/70 p-2.5">
                          <div className="mb-1 flex items-center gap-1 text-[12px] font-bold text-violet-500">
                            <UserRound className="h-3.5 w-3.5" />

                            הורה
                          </div>

                          <div className="truncate text-[14px] font-extrabold text-slate-800">
                            {
                              shift.parent_name
                            }
                          </div>

                          {shift.address ? (
                            <div className="mt-1 flex items-start gap-1 text-[11px] text-slate-500">
                              <MapPin className="mt-0.5 h-3 w-3 shrink-0" />

                              <span className="truncate">
                                {
                                  shift.address
                                }
                              </span>
                            </div>
                          ) : null}
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
                              shift.start_time_label
                            }{" "}
                            -{" "}
                            {
                              shift.end_time_label
                            }
                          </div>

                          {shift.start_date_label !==
                          shift.end_date_label ? (
                            <div className="mt-1 text-[11px] text-slate-500">
                              {
                                shift.start_date_label
                              }{" "}
                              →{" "}
                              {
                                shift.end_date_label
                              }
                            </div>
                          ) : null}
                        </div>

                        <div className="min-w-0 rounded-xl bg-emerald-50/70 p-2.5">
                          <div className="mb-1 flex items-center gap-1 text-[12px] font-bold text-emerald-600">
                            <WalletCards className="h-3.5 w-3.5" />

                            סה״כ
                          </div>

                          <div className="whitespace-nowrap text-[15px] font-extrabold tabular-nums text-emerald-700">
                            {formatNis(
                              shift.total_amount_nis
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                /*
                 * Pending נשאר
                 * כמו שהיה.
                 */
                return (
                  <div
                    key={
                      shift.id
                    }
                    className="flex flex-col space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <span className="block text-lg font-bold text-gray-800">
                          {
                            shift.parent_name
                          }
                        </span>

                        {!isPending &&
                        shift.address ? (
                          <p className="inline-flex max-w-full flex-row-reverse items-start gap-1.5 text-sm font-medium leading-snug text-slate-700">
                            <MapPin
                              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400"
                              aria-hidden
                            />

                            <span className="min-w-0 text-right">
                              {
                                shift.address
                              }
                            </span>
                          </p>
                        ) : isPending ? (
                          <p className="text-xs font-medium text-slate-500">
                            הכתובת המלאה תוצג לאחר אישור המשמרת.
                          </p>
                        ) : null}
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}
                      >
                        {
                          badge.label
                        }
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3 text-sm">
                      <div className="flex flex-col gap-2 text-right">
                        <p className="text-[13px] font-bold uppercase tracking-wide text-gray-500">
                          תחילת המשמרת
                        </p>

                        <div>
                          <span className="block text-xs font-medium text-gray-400">
                            שעת תחילת
                            המשמרת
                          </span>

                          <span className="mt-0.5 block text-lg font-bold tabular-nums text-gray-800">
                            {
                              shift.start_time_label
                            }
                          </span>
                        </div>

                        <div>
                          <span className="block text-xs font-medium text-gray-400">
                            תאריך התחלה
                          </span>

                          <span className="mt-0.5 block text-base font-bold text-gray-700">
                            {
                              shift.start_date_label
                            }
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 border-r border-gray-200 pr-3 text-right">
                        <p className="text-[13px] font-bold uppercase tracking-wide text-gray-500">
                          סיום המשמרת
                        </p>

                        <div>
                          <span className="block text-xs font-medium text-gray-400">
                            שעת סיום
                            המשמרת
                          </span>

                          <span className="mt-0.5 block text-lg font-bold tabular-nums text-gray-800">
                            {
                              shift.end_time_label
                            }
                          </span>
                        </div>

                        <div>
                          <span className="block text-xs font-medium text-gray-400">
                            תאריך סיום
                          </span>

                          <span className="mt-0.5 block text-base font-bold text-gray-700">
                            {
                              shift.end_date_label
                            }
                          </span>
                        </div>
                      </div>
                    </div>

                    {isPending ? (
                      <div className="space-y-2 pt-1">
                        <SitterParentProfilePreview
                          bookingId={shift.id}
                          fallbackParentName={shift.parent_name}
                          label="צפייה בפרופיל ההורה"
                          className="w-full justify-center rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm"
                        />

                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            disabled={
                              actingId ===
                              shift.id
                            }
                            onClick={() =>
                              void handleRespond(
                                shift,
                                "approved"
                              )
                            }
                            className="flex items-center justify-center rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white shadow-sm shadow-emerald-100 transition hover:bg-emerald-700 disabled:opacity-60"
                          >
                            {actingId ===
                            shift.id
                              ? "מעבד…"
                              : "אישור משמרת"}
                          </button>

                          <button
                            type="button"
                            disabled={
                              actingId ===
                              shift.id
                            }
                            onClick={() =>
                              void handleRespond(
                                shift,
                                "rejected"
                              )
                            }
                            className="flex items-center justify-center rounded-xl bg-rose-500 py-2.5 text-sm font-bold text-white shadow-sm shadow-rose-100 transition hover:bg-rose-600 disabled:opacity-60"
                          >
                            {actingId ===
                            shift.id
                              ? "מעבד…"
                              : "דחיית בקשה"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              }
            )}
          </div>
        )}
      </div>
    </SitterPageShell>
  );
}