import { NextResponse } from "next/server";
import { buildParentAvailabilityMonth, sanitizeParentAvailabilityDays } from "@/lib/favorites/parent-sitter-availability";
import type { CalendarMode } from "@/lib/availability/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import { isProfileRole, PROFILES_TABLE } from "@/lib/supabase/profiles";

function shiftIsoDate(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parent-facing sitter availability.
 * Returns date + state only. Booking names, notes, and other families are not selected.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const sitterId = String(id ?? "").trim();
    const url = new URL(request.url);
    const year = Number(url.searchParams.get("year"));
    const month = Number(url.searchParams.get("month"));

    if (!sitterId || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "בקשה לא תקינה." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const {
      data: { user },
      error: authErr
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase.from(PROFILES_TABLE).select("role").eq("id", user.id).maybeSingle();
    if (!isProfileRole(profile?.role) || profile.role !== "parent") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let admin;
    try {
      admin = getSupabaseServiceRoleClient();
    } catch {
      return NextResponse.json({ error: "לא ניתן לטעון זמינות כרגע." }, { status: 503 });
    }

    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const { data: modeRow, error: modeError } = await admin
      .from("sitter_profiles")
      .select("calendar_mode")
      .eq("id", sitterId)
      .maybeSingle();
    if (modeError || !modeRow) {
      return NextResponse.json({ error: "לא ניתן לטעון זמינות." }, { status: 400 });
    }

    const mode: CalendarMode =
      modeRow.calendar_mode === "only_selected" ? "only_selected" : "all_except_blocked";

    const { data: availability, error: availabilityError } = await admin
      .from("sitter_availability")
      .select("availability_date, slot_indices")
      .eq("sitter_id", sitterId)
      .gte("availability_date", start)
      .lte("availability_date", end);
    if (availabilityError) {
      return NextResponse.json({ error: "לא ניתן לטעון זמינות." }, { status: 400 });
    }

    const { data: bookings, error: bookingsError } = await admin
      .from("bookings")
      .select("start_time, end_time, status")
      .eq("sitter_id", sitterId)
      .gte("booking_date", shiftIsoDate(start, -1))
      .lte("booking_date", shiftIsoDate(end, 1));
    if (bookingsError) {
      return NextResponse.json({ error: "לא ניתן לטעון זמינות." }, { status: 400 });
    }

    const days = sanitizeParentAvailabilityDays(
      buildParentAvailabilityMonth({
        year,
        month,
        mode,
        availabilityRows: availability ?? [],
        bookings: bookings ?? []
      })
    );

    return NextResponse.json({ days });
  } catch (error) {
    console.error("[api/parent/sitter availability GET]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
