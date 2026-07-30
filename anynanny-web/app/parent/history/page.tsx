"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Calendar, Loader2, ArrowRight, RefreshCw, Clock3, WalletCards, UserRound } from "lucide-react";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { pickProfilePublicId } from "@/lib/public/sequential-display-id";
import { HOURLY_RATE } from "@/lib/session/protocol";

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

type HistorySessionRow = {
  id: string;
  booking_id?: string | null;
  sitter_id?: string | null;
  created_at?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  start_time_confirmed_by_sitter?: string | null;
  end_time_confirmed_by_parent?: string | null;
  final_elapsed_seconds?: number | null;
  total_minutes?: number | null;
  billing_rate_per_minute?: number | null;
  hourly_rate?: number | null;
  total_amount_charged?: number | null;
  final_amount_nis?: number | null;
  total_amount?: number | null;
};

type DateFilterMode = "last_week" | "last_month" | "last_year" | "custom";

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return Number.NaN;
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function endOfLocalDay(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return Number.NaN;
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

function formatShiftTime(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  const timeOnly = raw.match(/^(\d{1,2}):(\d{2})/);
  if (timeOnly) return `${timeOnly[1].padStart(2, "0")}:${timeOnly[2]}`;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(parsed);
}

function formatNis(amount: number | null): string {
  if (amount == null || !Number.isFinite(amount)) return "טרם נקבע";
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function finiteNonNegative(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function timestampMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function bookingDateTimeMs(date: unknown, time: unknown): number | null {
  if (typeof date !== "string" || typeof time !== "string" || !date || !time) return null;
  const direct = timestampMs(time);
  if (direct != null) return direct;
  return timestampMs(`${date.slice(0, 10)}T${time}`);
}

function localDateKey(value: unknown): string | null {
  const ms = timestampMs(value);
  return ms == null ? null : toIsoDate(new Date(ms));
}

function sessionStartValue(session: HistorySessionRow): string | null {
  return session.start_time || session.start_time_confirmed_by_sitter || session.created_at || null;
}

function sessionEndValue(session: HistorySessionRow): string | null {
  return session.end_time || session.end_time_confirmed_by_parent || null;
}

function resolveSessionForBooking(
  booking: { id: string; sitter_id?: string | null; booking_date?: string | null; start_time?: string | null },
  sessions: HistorySessionRow[]
): HistorySessionRow | undefined {
  const directlyLinked = sessions.find((session) => session.booking_id === booking.id || session.id === booking.id);
  if (directlyLinked) return directlyLinked;

  const sameSitter = sessions.filter(
    (session) => booking.sitter_id && session.sitter_id === booking.sitter_id
  );
  if (sameSitter.length === 0) return undefined;

  const bookingDate = booking.booking_date?.slice(0, 10);
  const sameDate = sameSitter.find((session) => localDateKey(sessionStartValue(session)) === bookingDate);
  if (sameDate) return sameDate;

  const scheduledStart = bookingDateTimeMs(booking.booking_date, booking.start_time);
  if (scheduledStart == null) return sameSitter[0];
  return sameSitter.reduce((closest, session) => {
    const currentStart = timestampMs(sessionStartValue(session));
    const closestStart = timestampMs(sessionStartValue(closest));
    if (currentStart == null) return closest;
    if (closestStart == null) return session;
    return Math.abs(currentStart - scheduledStart) < Math.abs(closestStart - scheduledStart)
      ? session
      : closest;
  });
}

function resolveCompletedShiftAmount(params: {
  session?: HistorySessionRow;
  bookingStart: unknown;
  bookingEnd: unknown;
  bookingDate: unknown;
  sitterHourlyRate: unknown;
  allowCalculation: boolean;
}): number | null {
  const { session } = params;
  const storedAmount =
    finiteNonNegative(session?.total_amount_charged) ??
    finiteNonNegative(session?.total_amount) ??
    finiteNonNegative(session?.final_amount_nis);
  if (storedAmount != null) return storedAmount;
  if (!params.allowCalculation) return null;

  const elapsedSeconds =
    finiteNonNegative(session?.final_elapsed_seconds) ??
    (() => {
      const minutes = finiteNonNegative(session?.total_minutes);
      return minutes == null ? null : minutes * 60;
    })() ??
    (() => {
      const start = timestampMs(session ? sessionStartValue(session) : null)
        ?? bookingDateTimeMs(params.bookingDate, params.bookingStart);
      const end = timestampMs(session ? sessionEndValue(session) : null)
        ?? bookingDateTimeMs(params.bookingDate, params.bookingEnd);
      return start != null && end != null && end >= start ? (end - start) / 1000 : null;
    })();

  if (elapsedSeconds == null) return null;
  const ratePerMinute = finiteNonNegative(session?.billing_rate_per_minute);
  const hourlyRate =
    (ratePerMinute != null && ratePerMinute > 0 ? ratePerMinute * 60 : null) ??
    finiteNonNegative(session?.hourly_rate) ??
    finiteNonNegative(params.sitterHourlyRate) ??
    HOURLY_RATE;

  return Math.round(((elapsedSeconds / 3600) * hourlyRate) * 100) / 100;
}

function resolvePresetRange(mode: Exclude<DateFilterMode, "custom">): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  if (mode === "last_week") start.setDate(end.getDate() - 7);
  else if (mode === "last_month") start.setMonth(end.getMonth() - 1);
  else start.setFullYear(end.getFullYear() - 1);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

export default function ParentHistoryPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const [shifts, setShifts] = useState<NannyShiftHistoryItem[]>([]);
  const [filterMode, setFilterMode] = useState<DateFilterMode>("last_month");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [loadingData, setLoadingData] = useState<boolean>(true);
  const [parentId, setParentId] = useState<string | null>(null);

  const fetchShiftHistory = useCallback(async (resolvedParentId: string) => {
    if (!supabase) return;
    try {
      setLoadingData(true);

      const bookingsResult = await supabase
        .from("bookings")
        .select(`
          id,
          sitter_id,
          booking_date,
          start_time,
          end_time,
          status,
          sitter_profiles ( nanny_serial, nanny_id_number, hourly_rate_nis ),
          profiles:sitter_id ( first_name )
        `)
        .eq("parent_id", resolvedParentId)
        .order("booking_date", { ascending: false });

      const sessionSelectAttempts = [
        "id, booking_id, sitter_id, created_at, start_time, end_time, start_time_confirmed_by_sitter, end_time_confirmed_by_parent, final_elapsed_seconds, total_minutes, billing_rate_per_minute, hourly_rate, total_amount_charged, final_amount_nis, total_amount",
        "id, booking_id, sitter_id, created_at, start_time, end_time, final_elapsed_seconds, billing_rate_per_minute, total_amount_charged, final_amount_nis",
        "id, booking_id, sitter_id, created_at, start_time_confirmed_by_sitter, end_time_confirmed_by_parent, total_minutes, hourly_rate, total_amount",
        "id, booking_id, sitter_id, created_at, start_time, end_time"
      ];
      let sessionRows: HistorySessionRow[] = [];
      let sessionReadError: string | null = null;
      for (const select of sessionSelectAttempts) {
        const result = await supabase
          .from("sessions")
          .select(select)
          .eq("parent_id", resolvedParentId)
          .order("created_at", { ascending: false });
        if (!result.error) {
          sessionRows = (result.data ?? []) as unknown as HistorySessionRow[];
          sessionReadError = null;
          break;
        }
        sessionReadError = result.error.message;
      }

      const { data, error } = bookingsResult;

      if (error) {
        console.warn("History: DB Response Error:", error.message);
        setShifts([]);
        return;
      }

      if (sessionReadError) {
        console.warn("History: Could not load session totals:", sessionReadError);
      }

      if (data && data.length > 0) {
        const formatted = data.map((booking: any) => {
          let displayDate = "ללא תאריך";
          let rawDateStr = booking.booking_date || "";

          if (booking.booking_date) {
            const parts = booking.booking_date.split("-");
            if (parts.length === 3) {
              displayDate = `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
            }
          }

          const profilesObj = Array.isArray(booking.sitter_profiles)
            ? booking.sitter_profiles[0]
            : booking.sitter_profiles;
          const nameRow = Array.isArray(booking.profiles) ? booking.profiles[0] : booking.profiles;
          const nannyName = String(nameRow?.first_name ?? "").trim() || "שמרטפית AnyNanny";
          const publicNannyId = pickProfilePublicId(profilesObj, "sitter") || "ללא מזהה";
          const session = resolveSessionForBooking(booking, sessionRows);
          const startTime = formatShiftTime((session && sessionStartValue(session)) || booking.start_time);
          const endTime = formatShiftTime((session && sessionEndValue(session)) || booking.end_time);
          const totalCost = resolveCompletedShiftAmount({
            session,
            bookingStart: booking.start_time,
            bookingEnd: booking.end_time,
            bookingDate: booking.booking_date,
            sitterHourlyRate: profilesObj?.hourly_rate_nis,
            allowCalculation: booking.status === "completed"
          });

          let statusLabel = "בפעילות";
          if (booking.status === "completed") statusLabel = "שולם";
          if (booking.status === "parent_started") statusLabel = "ממתין לאישור";

          return {
            id: booking.id,
            nanny_id: publicNannyId,
            nanny_name: nannyName,
            date: displayDate,
            raw_date: rawDateStr,
            time_range: startTime && endTime ? `${startTime} - ${endTime}` : "טרם נקבע",
            total_cost: totalCost,
            status: statusLabel
          };
        });
        setShifts(formatted);
      } else {
        setShifts([]);
      }
    } catch (err) {
      console.error("History: Request exception caught safely:", err);
    } finally {
      setLoadingData(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;

    const channels: ReturnType<typeof subscribePostgresChanges>[] = [];
    let cancelled = false;

    void supabase.auth.getUser().then(({ data: authData, error }) => {
      if (cancelled) return;
      const targetParentId = authData.user?.id;
      if (error || !targetParentId) {
        setLoadingData(false);
        setShifts([]);
        return;
      }

      setParentId(targetParentId);
      void fetchShiftHistory(targetParentId);
      channels.push(subscribePostgresChanges(
        supabase,
        `history-realtime-${targetParentId}`,
        {
          event: "*",
          table: "bookings",
          filter: `parent_id=eq.${targetParentId}`,
          handler: () => void fetchShiftHistory(targetParentId)
        }
      ));
      channels.push(subscribePostgresChanges(
        supabase,
        `history-sessions-realtime-${targetParentId}`,
        {
          event: "*",
          table: "sessions",
          filter: `parent_id=eq.${targetParentId}`,
          handler: () => void fetchShiftHistory(targetParentId)
        }
      ));
    });

    return () => {
      cancelled = true;
      for (const channel of channels) removeRealtimeChannel(supabase, channel);
    };
  }, [fetchShiftHistory, supabase]);

  const activeRange = useMemo(() => {
    if (filterMode === "custom") {
      return { start: startDate, end: endDate };
    }
    return resolvePresetRange(filterMode);
  }, [filterMode, startDate, endDate]);

  const filteredShifts = useMemo(() => {
    return shifts.filter((shift) => {
      if (!shift.raw_date) return filterMode === "custom" && !startDate && !endDate;
      const shiftTime = startOfLocalDay(shift.raw_date.slice(0, 10));
      if (!Number.isFinite(shiftTime)) return false;

      if (activeRange.start) {
        const startTime = startOfLocalDay(activeRange.start);
        if (Number.isFinite(startTime) && shiftTime < startTime) return false;
      }
      if (activeRange.end) {
        const endTime = endOfLocalDay(activeRange.end);
        if (Number.isFinite(endTime) && shiftTime > endTime) return false;
      }
      return true;
    });
  }, [shifts, filterMode, startDate, endDate, activeRange.start, activeRange.end]);

  return (
    <div className="w-full px-4 pt-2 pb-4 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push("/parent/dashboard")}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowRight className="h-4 w-4" />
          <span>חזרה לדשבורד</span>
        </button>
        <button
          type="button"
          onClick={() => parentId && fetchShiftHistory(parentId)}
          disabled={!parentId || loadingData}
          className="p-1 text-slate-400 hover:text-slate-600"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="text-center">
        <h1 className="text-sm font-extrabold text-navy-header">היסטוריית משמרות</h1>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-3 shadow-sm max-w-sm mx-auto space-y-2">
        <div className="text-[10px] font-bold text-slate-400 pr-1 flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          <span>סינון לפי טווח תאריכים</span>
        </div>

        <div>
          <label htmlFor="history-date-filter" className="text-[9px] text-slate-400 block mb-0.5 pr-1">
            בחירת טווח
          </label>
          <div className="relative">
            <select
              id="history-date-filter"
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value as DateFilterMode)}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50/50 py-2 pr-3 pl-8 text-[11px] font-semibold text-slate-700"
            >
              <option value="last_week">שבוע אחרון</option>
              <option value="last_month">חודש אחרון</option>
              <option value="last_year">שנה אחרונה</option>
              <option value="custom">בין התאריכים</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <svg className="h-3.5 w-3.5 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
              </svg>
            </div>
          </div>
        </div>

        {filterMode === "custom" ? (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-slate-400 block mb-0.5 pr-1">מתאריך</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-1.5 px-2 text-[11px] text-slate-700 text-center"
                style={{ direction: "ltr" }}
              />
            </div>
            <div>
              <label className="text-[9px] text-slate-400 block mb-0.5 pr-1">עד תאריך</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-1.5 px-2 text-[11px] text-slate-700 text-center"
                style={{ direction: "ltr" }}
              />
            </div>
          </div>
        ) : (
          <p className="text-[10px] text-slate-500 pr-1 tabular-nums">
            מציג משמרות מ-{activeRange.start.split("-").reverse().join("/")} עד{" "}
            {activeRange.end.split("-").reverse().join("/")}
          </p>
        )}
      </div>

      <section className="max-w-2xl mx-auto space-y-2.5">
        <div>
          {loadingData ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
              <p className="text-[11px]">טוען נתונים...</p>
            </div>
          ) : filteredShifts.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">לא נמצאו משמרות בטווח שנבחר</div>
          ) : (
            filteredShifts.map((shift) => (
              <div
                key={shift.id}
                className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="text-[13px] font-extrabold text-slate-800 tabular-nums">{shift.date}</div>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                      shift.status === "שולם"
                        ? "bg-emerald-50 text-emerald-700"
                        : shift.status === "ממתין לאישור"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {shift.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="min-w-0 rounded-xl bg-violet-50/70 p-2.5">
                    <div className="mb-1 flex items-center gap-1 text-[10px] font-bold text-violet-500">
                      <UserRound className="h-3.5 w-3.5" />
                      שמרטפית
                    </div>
                    <div className="truncate text-[12px] font-extrabold text-slate-800">{shift.nanny_name}</div>
                    <div className="mt-0.5 truncate font-mono text-[10px] font-semibold text-violet-600" dir="ltr">
                      {shift.nanny_id}
                    </div>
                  </div>

                  <div className="min-w-0 rounded-xl bg-blue-50/70 p-2.5">
                    <div className="mb-1 flex items-center gap-1 text-[10px] font-bold text-blue-500">
                      <Clock3 className="h-3.5 w-3.5" />
                      שעות
                    </div>
                    <div className="whitespace-nowrap text-[12px] font-extrabold text-slate-800 tabular-nums" dir="ltr">
                      {shift.time_range}
                    </div>
                  </div>

                  <div className="min-w-0 rounded-xl bg-emerald-50/70 p-2.5">
                    <div className="mb-1 flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                      <WalletCards className="h-3.5 w-3.5" />
                      סה״כ
                    </div>
                    <div className="whitespace-nowrap text-[13px] font-extrabold text-emerald-700 tabular-nums">
                      {formatNis(shift.total_cost)}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
