"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageBackLink, PageBackRow } from "@/components/navigation/page-back-link";
import { BookingCalendarPanel } from "@/components/bookings/booking-calendar-panel";
import {
  PARENT_CALENDAR_VIEW_OPTIONS,
  type CalendarShift
} from "@/components/bookings/booking-calendar-views";
import {
  isVisibleParentCalendarShift,
  PARENT_CALENDAR_LOAD_STATUSES
} from "@/lib/bookings/calendar-shift-filters";
import { BOOKINGS_TABLE, type BookingStatus } from "@/lib/bookings/constants";
import { normalizeBookingStatus } from "@/lib/bookings/booking-status-normalize";
import { formatBookingSchedule } from "@/lib/bookings/sitter-pending-bookings";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

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
        .in("status", PARENT_CALENDAR_LOAD_STATUSES)
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
        .select("id, first_name, last_name")
        .in("id", sitterIds);

      const nameBySitterId = new Map<string, string>();
      for (const profile of profiles ?? []) {
        if (!profile || typeof profile !== "object" || !("id" in profile)) continue;
        const id = String((profile as { id: string }).id);
        const row = profile as { first_name?: string | null; last_name?: string | null };
        const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
        if (name) nameBySitterId.set(id, name);
      }

      const formatted: CalendarShift[] = bookings
        .map((raw) => {
          const row = raw as {
            id: string;
            sitter_id: string;
            booking_date: string;
            start_time: string;
            end_time: string;
            status: BookingStatus;
          };
          const status = normalizeBookingStatus(row.status);
          if (!status) return null;
          return {
            id: row.id,
            partnerId: row.sitter_id,
            partnerName: nameBySitterId.get(row.sitter_id) ?? "שמרטפית AnyNanny",
            bookingDate: row.booking_date,
            startTime: row.start_time,
            endTime: row.end_time,
            status,
            scheduleLabel: formatBookingSchedule(row)
          };
        })
        .filter((shift): shift is CalendarShift => shift != null)
        .filter((shift) => isVisibleParentCalendarShift(shift));

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
          .select("id, role, first_name, last_name")
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
        <p className="text-center text-sm font-normal text-slate-500">טוען...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-md flex-col overflow-hidden pt-1" dir="rtl">
      <div className="shrink-0 space-y-4 pb-4">
        <PageBackRow>
          <PageBackLink href="/parent/dashboard" />
        </PageBackRow>

        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-navy-header">
            יומן המשמרות
          </h1>
          <p className="mx-auto mt-2 max-w-[22rem] text-sm font-normal leading-relaxed text-slate-500">
            כל המשמרות שלכם במקום אחד
          </p>
        </header>
      </div>

      <BookingCalendarPanel
        shifts={allShifts}
        loading={loadingBookings}
        viewModeSelectId="parent-calendar-view-mode"
        viewOptions={PARENT_CALENDAR_VIEW_OPTIONS}
        profileHref={profileHref}
        profileLinkLabel="פרופיל שמרטפית"
        className="min-h-0 flex-1"
      />
    </div>
  );
}
