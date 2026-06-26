"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { SitterPageShell } from "@/components/sitter/sitter-page-shell";
import { resolveBookingWindowMs } from "@/lib/bookings/booking-date-utils";
import {
  resolveShiftTimeWindow,
  sitterHasOverlappingActiveShift,
  SITTER_OVERLAP_APPROVE_MESSAGE
} from "@/lib/bookings/sitter-shift-overlap";
import { updateBookingStatus } from "@/lib/bookings/sitter-pending-bookings";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

interface BookingRow {
  id: string;
  parent_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
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
}

type ViewType = "upcoming" | "past" | "pending";

function formatDateHe(dateStr: string): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function isoDateFromMs(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function resolveShiftScheduleLabels(
  booking: Pick<BookingRow, "booking_date" | "start_time" | "end_time">
): Pick<Shift, "start_time_label" | "start_date_label" | "end_time_label" | "end_date_label"> {
  const window = resolveBookingWindowMs(booking);
  const fallbackDate = formatDateHe(booking.booking_date);

  if (!window) {
    return {
      start_time_label: "--:--",
      start_date_label: fallbackDate,
      end_time_label: "--:--",
      end_date_label: fallbackDate
    };
  }

  const timeFmt: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };

  return {
    start_time_label: new Date(window.startMs).toLocaleTimeString("he-IL", timeFmt),
    start_date_label: formatDateHe(booking.booking_date.slice(0, 10)),
    end_time_label: new Date(window.endMs).toLocaleTimeString("he-IL", timeFmt),
    end_date_label: formatDateHe(isoDateFromMs(window.endMs))
  };
}

function statusBadge(status: string, viewType: ViewType): { label: string; className: string } {
  if (status === "pending") {
    return { label: "ממתינה לאישור", className: "bg-rose-50 text-rose-700" };
  }
  if (viewType === "past" || status === "completed") {
    return { label: "בוצעה", className: "bg-emerald-50 text-emerald-700" };
  }
  if (status === "approved") {
    return { label: "מאושרת", className: "bg-emerald-50 text-emerald-700" };
  }
  return { label: "עתידית", className: "bg-amber-50 text-amber-700" };
}

export default function SitterShiftsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [viewType, setViewType] = useState<ViewType>("upcoming");
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleAddressId, setVisibleAddressId] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchRealShifts = useCallback(async () => {
    const sitterId = user?.id;
    if (!sitterId) {
      setShifts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setShifts([]);
        return;
      }

      const todayStr = new Date().toISOString().split("T")[0];

      let query = supabase
        .from("bookings")
        .select("id, parent_id, booking_date, start_time, end_time, status")
        .eq("sitter_id", sitterId);

      if (viewType === "pending") {
        query = query.eq("status", "pending");
      } else if (viewType === "upcoming") {
        query = query.gte("booking_date", todayStr).neq("status", "completed").neq("status", "rejected");
      } else {
        query = query.eq("status", "completed");
      }

      const { data, error } = await query.order("booking_date", {
        ascending: viewType !== "past"
      });

      if (error) throw error;

      const bookingRows = (data ?? []) as BookingRow[];
      const parentIds = [...new Set(bookingRows.map((row) => row.parent_id).filter(Boolean))];

      const parentNameById = new Map<string, string>();
      if (parentIds.length > 0) {
        const { data: profileRows, error: profilesError } = await supabase
          .from(PROFILES_TABLE)
          .select("id, full_name")
          .in("id", parentIds);

        if (profilesError) {
          console.warn("Could not load parent names for shifts:", profilesError.message);
        } else {
          for (const profile of profileRows ?? []) {
            const name =
              typeof profile.full_name === "string" && profile.full_name.trim()
                ? profile.full_name.trim()
                : null;
            if (name) parentNameById.set(String(profile.id), name);
          }
        }
      }

      const formattedShifts: Shift[] = bookingRows.map((b) => ({
        id: b.id,
        parent_id: b.parent_id,
        parent_name: parentNameById.get(b.parent_id) ?? "הורה AnyNanny",
        ...resolveShiftScheduleLabels(b),
        status: b.status,
        booking_date: b.booking_date,
        start_time: b.start_time,
        end_time: b.end_time,
        address: "הכתובת תיטען בהמשך מחשבון ההורה..."
      }));

      setShifts(formattedShifts);
    } catch (err) {
      console.error("Error fetching shifts from Supabase:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, viewType]);

  useEffect(() => {
    if (authLoading) return;
    void fetchRealShifts();
  }, [authLoading, fetchRealShifts]);

  useEffect(() => {
    if (!actionMessage) return;
    const id = window.setTimeout(() => setActionMessage(null), 4500);
    return () => window.clearTimeout(id);
  }, [actionMessage]);

  const handleRespond = async (shift: Shift, status: "approved" | "rejected") => {
    const sitterId = user?.id;
    if (!sitterId || actingId) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setActionError("Supabase לא זמין");
      return;
    }

    if (status === "approved") {
      const proposedWindow = resolveShiftTimeWindow(shift);
      if (proposedWindow) {
        const hasOverlap = await sitterHasOverlappingActiveShift(supabase, sitterId, proposedWindow, {
          bookingId: shift.id
        });
        if (hasOverlap) {
          setActionError(SITTER_OVERLAP_APPROVE_MESSAGE);
          return;
        }
      }
    }

    setActionError(null);
    setActingId(shift.id);

    const { error } = await updateBookingStatus(supabase, sitterId, shift.id, status);
    setActingId(null);

    if (error) {
      setActionError(error);
      void fetchRealShifts();
      return;
    }

    setActionMessage(status === "approved" ? "המשמרת אושרה — ההורה יקבל עדכון" : "הבקשה נדחתה — ההורה יקבל עדכון");
    void fetchRealShifts();
  };

  const handleContactClick = (parentId: string) => {
    router.push(`/sitter/messages?parentId=${encodeURIComponent(parentId)}`);
  };

  const toggleAddressVisibility = (shiftId: string) => {
    setVisibleAddressId(visibleAddressId === shiftId ? null : shiftId);
  };

  return (
    <SitterPageShell
      title="לוח המשמרות שלי"
      subtitle="בקשות ממתינות לאישור, ומשמרות מאושרות — הכל מטבלת הבקשות האמיתית."
    >
      <div className="w-full max-w-md mx-auto text-right" dir="rtl">
        <div className="mb-6">
          <label className="block text-xs font-bold text-gray-400 uppercase mb-2 mr-1">
            בחר סוג תצוגה
          </label>
          <div className="relative">
            <select
              value={viewType}
              onChange={(e) => {
                setViewType(e.target.value as ViewType);
                setVisibleAddressId(null);
                setActionError(null);
              }}
              className="w-full p-3.5 bg-white border border-gray-200 rounded-xl font-semibold text-gray-700 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500 appearance-none transition-all cursor-pointer"
            >
              <option value="pending">⏳ ממתינות לאישור</option>
              <option value="upcoming">🔮 משמרות עתידיות</option>
              <option value="past">✅ משמרות שבוצעו</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-gray-500">
              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
              </svg>
            </div>
          </div>
        </div>

        {actionMessage ? (
          <p
            role="status"
            className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900"
          >
            {actionMessage}
          </p>
        ) : null}

        {actionError ? (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900"
          >
            {actionError}
          </p>
        ) : null}

        {loading || authLoading ? (
          <div className="text-center py-10 text-gray-400 font-medium">מושך נתונים חיים מה-Database...</div>
        ) : shifts.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400">
            אין משמרות רשומות בקטגוריה זו ב-Supabase.
          </div>
        ) : (
          <div className="space-y-4">
            {shifts.map((shift) => {
              const badge = statusBadge(shift.status, viewType);
              const isPending = shift.status === "pending";

              return (
                <div
                  key={shift.id}
                  className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col space-y-4"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-gray-800">{shift.parent_name}</span>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded-xl text-sm">
                    <div className="flex flex-col gap-2 text-right">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">תחילת המשמרת</p>
                      <div>
                        <span className="block text-xs text-gray-400 font-medium">שעת תחילת המשמרת</span>
                        <span className="mt-0.5 block text-lg font-bold tabular-nums text-gray-800">
                          {shift.start_time_label}
                        </span>
                      </div>
                      <div>
                        <span className="block text-xs text-gray-400 font-medium">תאריך התחלה</span>
                        <span className="mt-0.5 block text-base font-bold text-gray-700">{shift.start_date_label}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 border-r border-gray-200 pr-3 text-right">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">סיום המשמרת</p>
                      <div>
                        <span className="block text-xs text-gray-400 font-medium">שעת סיום המשמרת</span>
                        <span className="mt-0.5 block text-lg font-bold tabular-nums text-gray-800">
                          {shift.end_time_label}
                        </span>
                      </div>
                      <div>
                        <span className="block text-xs text-gray-400 font-medium">תאריך סיום</span>
                        <span className="mt-0.5 block text-base font-bold text-gray-700">{shift.end_date_label}</span>
                      </div>
                    </div>
                  </div>

                  {isPending ? (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <button
                        type="button"
                        disabled={actingId === shift.id}
                        onClick={() => void handleRespond(shift, "approved")}
                        className="flex items-center justify-center rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white shadow-sm shadow-emerald-100 transition hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {actingId === shift.id ? "מעבד…" : "אישור משמרת"}
                      </button>
                      <button
                        type="button"
                        disabled={actingId === shift.id}
                        onClick={() => void handleRespond(shift, "rejected")}
                        className="flex items-center justify-center rounded-xl bg-rose-500 py-2.5 text-sm font-bold text-white shadow-sm shadow-rose-100 transition hover:bg-rose-600 disabled:opacity-60"
                      >
                        {actingId === shift.id ? "מעבד…" : "דחיית בקשה"}
                      </button>
                    </div>
                  ) : viewType === "upcoming" ? (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => toggleAddressVisibility(shift.id)}
                        className="flex items-center justify-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-xl text-sm transition-colors"
                      >
                        📍 {visibleAddressId === shift.id ? "הסתר כתובת" : "הצג כתובת"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleContactClick(shift.parent_id)}
                        className="flex items-center justify-center gap-1 bg-amber-500 hover:bg-amber-600 text-white font-medium py-2.5 rounded-xl text-sm transition-colors shadow-sm shadow-amber-100"
                      >
                        💬 צור קשר
                      </button>
                    </div>
                  ) : null}

                  {visibleAddressId === shift.id && !isPending ? (
                    <div className="bg-amber-50/60 border border-amber-100 text-amber-900 p-3 rounded-xl text-sm">
                      <span className="block text-xs text-amber-700 font-bold mb-0.5">כתובת זמנית:</span>
                      <span className="font-semibold">{shift.address}</span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SitterPageShell>
  );
}
