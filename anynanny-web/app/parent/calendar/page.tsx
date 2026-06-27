"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BookingCalendarPanel } from "@/components/bookings/booking-calendar-panel";
import type { CalendarShift } from "@/components/bookings/booking-calendar-views";
import { BOOKINGS_TABLE, type BookingStatus } from "@/lib/bookings/constants";
import { formatBookingSchedule } from "@/lib/bookings/sitter-pending-bookings";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

const BOOKED_STATUSES: BookingStatus[] = [
  "pending",
  "approved",
  "sitter_started",
  "parent_started",
  "sitter_ended",
  "completed"
];

export default function ParentCalendarPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
  const [allShifts, setAllShifts] = useState<CalendarShift[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  const fetchBookedShifts = useCallback(async (resolvedParentId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setLoadingBookings(true);
    try {
      const { data: rows, error } = await supabase
        .from(BOOKINGS_TABLE)
        .select("id, parent_id, sitter_id, booking_date, start_time, end_time, status")
        .eq("parent_id", resolvedParentId)
        .in("status", BOOKED_STATUSES)
        .order("booking_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) {
        console.warn("[parent/calendar] bookings load:", error.message);
        setAllShifts([]);
        return;
      }

      const bookings = rows ?? [];
      if (bookings.length === 0) {
        setAllShifts([]);
        return;
      }

      const sitterIds = [...new Set(bookings.map((b) => String((b as { sitter_id: string }).sitter_id)))];
      const { data: profiles } = await supabase
        .from(PROFILES_TABLE)
        .select("id, full_name")
        .in("id", sitterIds);

      const nameBySitterId = new Map<string, string>();
      for (const profile of profiles ?? []) {
        if (!profile || typeof profile !== "object" || !("id" in profile)) continue;
        const id = String((profile as { id: string }).id);
        const name = String((profile as { full_name?: string | null }).full_name ?? "").trim();
        if (name) nameBySitterId.set(id, name);
      }

      const formatted: CalendarShift[] = bookings.map((raw) => {
        const row = raw as {
          id: string;
          sitter_id: string;
          booking_date: string;
          start_time: string;
          end_time: string;
          status: BookingStatus;
        };
        return {
          id: row.id,
          partnerId: row.sitter_id,
          partnerName: nameBySitterId.get(row.sitter_id) ?? "שמרטפית AnyNanny",
          bookingDate: row.booking_date,
          startTime: row.start_time,
          endTime: row.end_time,
          status: row.status,
          scheduleLabel: formatBookingSchedule(row)
        };
      });

      setAllShifts(formatted);
    } catch (e) {
      console.warn("[parent/calendar] bookings fetch failed:", e);
      setAllShifts([]);
    } finally {
      setLoadingBookings(false);
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setReady(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData.user;
        if (!user) {
          if (!cancelled) router.replace("/auth/login?next=/parent/calendar");
          return;
        }

        const { data: profile, error } = await supabase
          .from(PROFILES_TABLE)
          .select("id, role, full_name")
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          console.warn("[parent/calendar] profile load:", error.message);
        }

        if (!cancelled && profile?.role && profile.role !== "parent") {
          router.replace("/parent/dashboard");
          return;
        }

        if (!cancelled) {
          setParentId(user.id);
          setReady(true);
        }
      } catch (e) {
        console.warn("[parent/calendar] bootstrap failed:", e);
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!parentId) return;
    void fetchBookedShifts(parentId);
  }, [parentId, fetchBookedShifts]);

  const profileHref = useCallback(
    (shift: CalendarShift) => `/parent/sitter/${encodeURIComponent(shift.partnerId)}`,
    []
  );

  if (!ready) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <p className="text-center text-sm text-slate-600">טוען...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-md flex-col overflow-hidden" dir="rtl">
      <div className="shrink-0 pb-3">
        <Link
          href="/parent/dashboard"
          className="flex items-center gap-1 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
        >
          <span>חזרה לדשבורד</span>
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      <BookingCalendarPanel
        shifts={allShifts}
        loading={loadingBookings}
        viewModeSelectId="parent-calendar-view-mode"
        profileHref={profileHref}
        profileLinkLabel="פרופיל שמרטפית"
        className="min-h-0 flex-1"
      />
    </div>
  );
}
