import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKING_SELECT_MINIMAL } from "@/lib/bookings/booking-status-update";
import { isBookingEligibleForLiveShiftUi } from "@/lib/bookings/booking-shift-ui";
import { isSitterShiftCircleStatus } from "@/lib/bookings/booking-realtime-handler";
import {
  IN_FLIGHT_BOOKING_STATUSES,
  isBookingLiveAcrossMidnight,
  todayDateISO
} from "@/lib/bookings/booking-date-utils";
import { BOOKINGS_TABLE, type BookingRow, type BookingStatus } from "@/lib/bookings/constants";
import { formatBookingSchedule } from "@/lib/bookings/sitter-pending-bookings";
import { normalizeBookingStatus, type BookingStatusInput } from "@/lib/bookings/use-shift-activation-status";
import {
  fetchPublicSitterProfileViaRpc,
  publicSitterDisplayName
} from "@/lib/sitter/fetch-parent-sitter-profile";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
import { safeSupabaseRead } from "@/lib/supabase/safe-supabase-read";

/** Statuses that keep parent/sitter linked for today's Double-Shake flow (incl. pending for preview window). */
export const TODAYS_LINKED_BOOKING_STATUSES: BookingStatus[] = [
  "pending",
  "approved",
  "sitter_started",
  "parent_started",
  "sitter_ended"
];

/**
 * Sitter linked booking statuses — includes `pending` so new parent requests
 * hydrate immediately (approval card) without a hard refresh.
 * Pending rows stay out of the Double-Shake circle via UI gates.
 */
export const SITTER_TODAYS_LINKED_BOOKING_STATUSES: BookingStatus[] = [
  "pending",
  "approved",
  "sitter_started",
  "parent_started",
  "sitter_ended"
];

export type TodaysLinkedBookingView = BookingRow & {
  schedule_label: string;
  partner_user_id: string;
  partner_full_name: string | null;
  /** Public nanny serial (e.g. AN-1004) when partner is the sitter. */
  partner_sitter_code: string | null;
  /** Formatted parent address from `profiles.address` when partner is the parent. */
  partner_address: string | null;
};

function pickSitterCode(raw: Record<string, unknown> | null | undefined): string | null {
  if (!raw) return null;
  const serial = String(raw.nanny_serial ?? raw.nanny_id_number ?? raw.nannySerial ?? "").trim();
  return serial.length > 0 ? serial : null;
}

function readAddressCity(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (!raw || typeof raw !== "object") return "";
  const row = raw as Record<string, unknown>;
  // Prefer explicit city fields; also accept nested `{ name: "חיפה" }` leftovers.
  const candidates = [row.city, row.cityName, row.city_name, row.locality];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (candidate && typeof candidate === "object") {
      const nested = candidate as Record<string, unknown>;
      const name = nested.name ?? nested.label ?? nested.value;
      if (typeof name === "string" && name.trim()) return name.trim();
    }
  }
  return "";
}

/** Formats parent `profiles.address` as `רחוב מספר, עיר` (e.g. "הנס 41, חיפה"). */
export function formatParentProfileAddress(raw: unknown): string | null {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed || null;
  }
  if (!raw || typeof raw !== "object") return null;

  const address = raw as Record<string, unknown>;
  const city = readAddressCity(address);
  const street = String(address.street ?? address.streetName ?? address.street_name ?? "").trim();
  const houseNumber = String(
    address.houseNumber ?? address.house_number ?? address.number ?? address.house ?? ""
  ).trim();

  const streetLine = [street, houseNumber].filter(Boolean).join(" ").trim();
  if (streetLine && city) return `${streetLine}, ${city}`;
  if (streetLine) return streetLine;
  if (city) return city;
  return null;
}

export function formatParentShiftStartButtonLabel(
  fullName: string | null | undefined,
  sitterCode: string | null | undefined
): string {
  const name = fullName?.trim() || "הנני";
  const code = sitterCode?.trim();
  return code ? `תחילת משמרת של ${name} (${code})` : `תחילת משמרת של ${name}`;
}

export function formatParentShiftApproveButtonLabel(
  fullName: string | null | undefined,
  sitterCode: string | null | undefined
): string {
  const name = fullName?.trim() || "הנני";
  const code = sitterCode?.trim();
  return code ? `אשר תחילת משמרת של ${name} (${code})` : `אשר תחילת משמרת של ${name}`;
}

export type TodayBookingShiftGate = Pick<
  BookingRow,
  "id" | "status" | "parent_id" | "sitter_id"
>;

async function enrichLinkedBookingView(
  supabase: SupabaseClient,
  row: BookingRow,
  role: "parent" | "sitter"
): Promise<TodaysLinkedBookingView | null> {
  const partnerColumn = role === "parent" ? "sitter_id" : "parent_id";
  const booking: BookingRow = {
    ...row,
    status: normalizeBookingStatus(row.status as BookingStatusInput) ?? "pending"
  };

  if (role === "sitter") {
    const status = normalizeBookingStatus(booking.status as BookingStatusInput) ?? booking.status;
    if (status !== "pending" && !isSitterShiftCircleStatus(booking.status)) {
      return null;
    }
  } else if (!isBookingEligibleForLiveShiftUi(booking)) {
    return null;
  }

  const partnerId = String(booking[partnerColumn as keyof BookingRow]);

  let partnerName: string | null = null;
  let partnerAddress: string | null = null;
  let partnerSitterCode: string | null = null;

  if (role === "parent") {
    const publicProfile = await fetchPublicSitterProfileViaRpc(supabase, partnerId);
    if (publicProfile) {
      partnerSitterCode = pickSitterCode(publicProfile as unknown as Record<string, unknown>);
      partnerName = publicSitterDisplayName(publicProfile);
    }
  } else {
    let profileRead = safeSupabaseRead(
      await supabase
        .from(PROFILES_TABLE)
        .select("first_name, last_name, address")
        .eq("id", partnerId)
        .maybeSingle(),
      "partner profile name"
    );

    if (
      profileRead.error &&
      (isPostgrestMissingColumnError(profileRead.error, "address") ||
        /column|schema cache|could not find/i.test(String(profileRead.error)))
    ) {
      profileRead = safeSupabaseRead(
        await supabase.from(PROFILES_TABLE).select("first_name, last_name").eq("id", partnerId).maybeSingle(),
        "partner profile name fallback"
      );
    }

    partnerName =
      profileRead.data && typeof profileRead.data === "object"
        ? `${(profileRead.data as { first_name?: string | null }).first_name ?? ""} ${(profileRead.data as { last_name?: string | null }).last_name ?? ""}`.trim() ||
          null
        : null;

    partnerAddress =
      profileRead.data && typeof profileRead.data === "object"
        ? formatParentProfileAddress((profileRead.data as { address?: unknown }).address)
        : null;
  }

  return {
    ...booking,
    schedule_label: formatBookingSchedule(booking),
    partner_user_id: partnerId,
    partner_full_name: partnerName,
    partner_sitter_code: partnerSitterCode,
    partner_address: partnerAddress
  };
}

/** Latest pending request between a parent/sitter pair (profile page hydration). */
export async function fetchPendingBookingForParentSitter(
  supabase: SupabaseClient,
  parentId: string,
  sitterId: string
): Promise<{ id: string; status: BookingStatus } | null> {
  const { data, error } = await supabase
    .from(BOOKINGS_TABLE)
    .select("id, status")
    .eq("parent_id", parentId)
    .eq("sitter_id", sitterId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const status = normalizeBookingStatus((data as BookingRow).status as BookingStatusInput) ?? "pending";
  return { id: String((data as { id: string }).id), status };
}

/** Today's pending booking request — survives refresh/navigation while awaiting sitter response. */
export async function fetchTodaysPendingBookingRequest(
  supabase: SupabaseClient,
  userId: string,
  role: "parent" | "sitter"
): Promise<{ booking: TodaysLinkedBookingView | null; error: string | null }> {
  const today = todayDateISO();
  const participantColumn = role === "parent" ? "parent_id" : "sitter_id";

  const { data: row, error } = await supabase
    .from(BOOKINGS_TABLE)
    .select(BOOKING_SELECT_MINIMAL)
    .eq(participantColumn, userId)
    .eq("booking_date", today)
    .eq("status", "pending")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { booking: null, error: error.message };
  }

  if (!row) {
    return { booking: null, error: null };
  }

  const booking = await enrichLinkedBookingView(supabase, row as BookingRow, role);
  return { booking, error: null };
}

async function fetchInFlightLinkedBooking(
  supabase: SupabaseClient,
  userId: string,
  role: "parent" | "sitter",
  statuses: BookingStatus[]
): Promise<BookingRow | null> {
  const participantColumn = role === "parent" ? "parent_id" : "sitter_id";

  const { data, error } = await supabase
    .from(BOOKINGS_TABLE)
    .select(BOOKING_SELECT_MINIMAL)
    .eq(participantColumn, userId)
    .in("status", statuses)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (error || !data?.length) {
    return null;
  }

  for (const row of data as BookingRow[]) {
    if (isBookingLiveAcrossMidnight(row)) {
      return row;
    }
  }

  return null;
}

async function fetchLinkedBookingRow(
  supabase: SupabaseClient,
  userId: string,
  role: "parent" | "sitter"
): Promise<{ row: BookingRow | null; error: string | null }> {
  const today = todayDateISO();
  const participantColumn = role === "parent" ? "parent_id" : "sitter_id";
  const linkedStatuses =
    role === "sitter" ? SITTER_TODAYS_LINKED_BOOKING_STATUSES : TODAYS_LINKED_BOOKING_STATUSES;

  const { data: todayRow, error: todayError } = await supabase
    .from(BOOKINGS_TABLE)
    .select(BOOKING_SELECT_MINIMAL)
    .eq(participantColumn, userId)
    .eq("booking_date", today)
    .in("status", linkedStatuses)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (todayError) {
    // Date filter/select failed — fall back to status-only so the dashboard still hydrates.
    console.warn("[todays-linked-booking] today-scoped fetch:", todayError.message);
    const crossMidnight = await fetchInFlightLinkedBooking(
      supabase,
      userId,
      role,
      linkedStatuses
    );
    return { row: crossMidnight, error: crossMidnight ? null : todayError.message };
  }

  if (todayRow) {
    return { row: todayRow as BookingRow, error: null };
  }

  const crossMidnight = await fetchInFlightLinkedBooking(
    supabase,
    userId,
    role,
    role === "sitter" ? SITTER_TODAYS_LINKED_BOOKING_STATUSES : [...IN_FLIGHT_BOOKING_STATUSES]
  );

  return { row: crossMidnight, error: null };
}

async function fetchActiveShiftGateRow(
  supabase: SupabaseClient,
  userId: string,
  role: "parent" | "sitter"
): Promise<TodayBookingShiftGate | null> {
  const participantColumn = role === "parent" ? "parent_id" : "sitter_id";

  const inFlightRow = await fetchInFlightLinkedBooking(
    supabase,
    userId,
    role,
    [...IN_FLIGHT_BOOKING_STATUSES]
  );

  if (inFlightRow) {
    return gateFromBooking(inFlightRow);
  }

  const today = todayDateISO();
  const { data, error } = await supabase
    .from(BOOKINGS_TABLE)
    .select("id, status, parent_id, sitter_id")
    .eq(participantColumn, userId)
    .eq("booking_date", today)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (error || !data?.length) {
    return null;
  }

  const rows = data as TodayBookingShiftGate[];
  // Prefer a live/approved shift over a stale completed row from earlier today.
  const livePreferred = rows.find((row) => {
    const status = normalizeBookingStatus(row.status as BookingStatusInput) ?? row.status;
    return (
      status === "pending" ||
      status === "approved" ||
      status === "sitter_started" ||
      status === "parent_started" ||
      status === "sitter_ended"
    );
  });

  return livePreferred ?? rows[0] ?? null;
}

function gateFromBooking(row: BookingRow): TodayBookingShiftGate {
  return {
    id: row.id,
    status: normalizeBookingStatus(row.status as BookingStatusInput) ?? row.status,
    parent_id: row.parent_id,
    sitter_id: row.sitter_id
  };
}

/**
 * Parent dashboard bundle — pending rows win over stale gate rows so the
 * "request sent" state survives refresh/tab switch until sitter responds.
 */
export async function fetchParentTodayBookingBundle(
  supabase: SupabaseClient,
  parentId: string
): Promise<{
  booking: TodaysLinkedBookingView | null;
  gate: TodayBookingShiftGate | null;
  error: string | null;
}> {
  const pendingResult = await fetchTodaysPendingBookingRequest(supabase, parentId, "parent");
  if (pendingResult.error) {
    return { booking: null, gate: null, error: pendingResult.error };
  }

  if (pendingResult.booking) {
    return {
      booking: pendingResult.booking,
      gate: gateFromBooking(pendingResult.booking),
      error: null
    };
  }

  const [linked, gate] = await Promise.all([
    fetchTodaysLinkedBooking(supabase, parentId, "parent"),
    fetchTodayBookingShiftGate(supabase, parentId, "parent")
  ]);

  let nextBooking = linked.booking;
  if (!nextBooking && gate?.id) {
    nextBooking = await fetchLinkedBookingById(supabase, gate.id, "parent");
  }

  return { booking: nextBooking, gate, error: linked.error };
}

export async function fetchLinkedBookingById(
  supabase: SupabaseClient,
  bookingId: string,
  role: "parent" | "sitter"
): Promise<TodaysLinkedBookingView | null> {
  const { data: row, error } = await supabase
    .from(BOOKINGS_TABLE)
    .select(BOOKING_SELECT_MINIMAL)
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !row) {
    return null;
  }

  return enrichLinkedBookingView(supabase, row as BookingRow, role);
}

export async function fetchTodaysLinkedBooking(
  supabase: SupabaseClient,
  userId: string,
  role: "parent" | "sitter"
): Promise<{ booking: TodaysLinkedBookingView | null; error: string | null }> {
  const { row, error } = await fetchLinkedBookingRow(supabase, userId, role);

  if (error) {
    return { booking: null, error };
  }

  if (!row) {
    // Parent and sitter: fall back to today's pending request so live inserts are not missed.
    return fetchTodaysPendingBookingRequest(supabase, userId, role);
  }

  const booking = await enrichLinkedBookingView(supabase, row, role);
  return { booking, error: null };
}

/** Active shift gate — prefers in-flight rows across midnight, then today's latest row. */
export async function fetchTodayBookingShiftGate(
  supabase: SupabaseClient,
  userId: string,
  role: "parent" | "sitter"
): Promise<TodayBookingShiftGate | null> {
  return fetchActiveShiftGateRow(supabase, userId, role);
}
