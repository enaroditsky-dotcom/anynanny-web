import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { SESSIONS_TABLE } from "@/lib/session/protocol";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";

export const STUCK_SHIFT_REVIEW_BOOKING_SELECT =
  "id, parent_id, sitter_id, status, payment_status, hourly_rate_nis, start_time, end_time, actual_start_time, actual_end_time, created_at, requires_admin_review, stuck_release_reason, stuck_release_detail, stuck_released_at, stuck_released_by";

export const STUCK_SHIFT_REVIEW_BOOKING_SELECT_CORE =
  "id, parent_id, sitter_id, status, payment_status, hourly_rate_nis, start_time, end_time, actual_start_time, actual_end_time, created_at, requires_admin_review";

export const STUCK_SHIFT_REVIEW_SESSION_SELECT =
  "id, booking_id, status, session_status, start_time, end_time, actual_start_time, actual_end_time, sitter_start_shake, parent_start_shake, sitter_end_shake, parent_end_shake";

export type StuckShiftReleasedByRole = "parent" | "sitter" | "unknown";

export type StuckShiftReviewCase = {
  bookingId: string;
  sessionId: string | null;
  createdAt: string | null;
  releasedAt: string | null;
  releasedBy: string | null;
  releasedByRole: StuckShiftReleasedByRole;
  parentId: string;
  sitterId: string;
  parentName: string;
  sitterName: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  sitterStartShake: string | null;
  parentStartShake: string | null;
  sitterEndShake: string | null;
  parentEndShake: string | null;
  hourlyRateNis: number | null;
  paymentStatus: string | null;
  bookingStatus: string | null;
  releaseReason: string | null;
  releaseDetail: string | null;
};

type ReviewBookingRow = {
  id?: string | null;
  parent_id?: string | null;
  sitter_id?: string | null;
  status?: string | null;
  payment_status?: string | null;
  hourly_rate_nis?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  actual_start_time?: string | null;
  actual_end_time?: string | null;
  created_at?: string | null;
  requires_admin_review?: boolean | null;
  stuck_release_reason?: string | null;
  stuck_release_detail?: string | null;
  stuck_released_at?: string | null;
  stuck_released_by?: string | null;
};

type ReviewSessionRow = {
  id?: string | number | null;
  booking_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  actual_start_time?: string | null;
  actual_end_time?: string | null;
  sitter_start_shake?: string | null;
  parent_start_shake?: string | null;
  sitter_end_shake?: string | null;
  parent_end_shake?: string | null;
};

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

export function stuckShiftReleasedByRole(booking: {
  parent_id?: string | null;
  sitter_id?: string | null;
  stuck_released_by?: string | null;
}): StuckShiftReleasedByRole {
  const releasedBy = asText(booking.stuck_released_by);
  if (!releasedBy) return "unknown";
  if (releasedBy === asText(booking.parent_id)) return "parent";
  if (releasedBy === asText(booking.sitter_id)) return "sitter";
  return "unknown";
}

function displayName(row: { first_name?: string | null; last_name?: string | null } | null | undefined): string {
  const first = String(row?.first_name ?? "").trim();
  const last = String(row?.last_name ?? "").trim();
  const name = [first, last].filter(Boolean).join(" ");
  return name || "—";
}

export function mapStuckShiftReviewCases(
  bookings: ReviewBookingRow[] | null | undefined,
  sessions: ReviewSessionRow[] | null | undefined,
  profilesById: Record<string, { first_name?: string | null; last_name?: string | null } | undefined>
): StuckShiftReviewCase[] {
  const sessionByBookingId = new Map<string, ReviewSessionRow>();
  for (const session of sessions ?? []) {
    const bookingId = asText(session.booking_id);
    if (!bookingId || sessionByBookingId.has(bookingId)) continue;
    sessionByBookingId.set(bookingId, session);
  }

  return (bookings ?? [])
    .filter((row) => row?.requires_admin_review === true && asText(row.id))
    .map((booking) => {
      const bookingId = asText(booking.id) as string;
      const session = sessionByBookingId.get(bookingId) ?? null;
      const parentId = asText(booking.parent_id) ?? "";
      const sitterId = asText(booking.sitter_id) ?? "";
      return {
        bookingId,
        sessionId: session?.id != null ? String(session.id) : null,
        createdAt: asText(booking.created_at),
        releasedAt: asText(booking.stuck_released_at),
        releasedBy: asText(booking.stuck_released_by),
        releasedByRole: stuckShiftReleasedByRole(booking),
        parentId,
        sitterId,
        parentName: displayName(profilesById[parentId]),
        sitterName: displayName(profilesById[sitterId]),
        scheduledStart: asText(booking.start_time),
        scheduledEnd: asText(booking.end_time),
        actualStart: asText(booking.actual_start_time) ?? asText(session?.actual_start_time) ?? asText(session?.start_time),
        actualEnd: asText(booking.actual_end_time) ?? asText(session?.actual_end_time) ?? asText(session?.end_time),
        sitterStartShake: asText(session?.sitter_start_shake),
        parentStartShake: asText(session?.parent_start_shake),
        sitterEndShake: asText(session?.sitter_end_shake),
        parentEndShake: asText(session?.parent_end_shake),
        hourlyRateNis:
          booking.hourly_rate_nis != null && Number.isFinite(Number(booking.hourly_rate_nis))
            ? Number(booking.hourly_rate_nis)
            : null,
        paymentStatus: asText(booking.payment_status),
        bookingStatus: asText(booking.status),
        releaseReason: asText(booking.stuck_release_reason),
        releaseDetail: asText(booking.stuck_release_detail)
      };
    })
    .sort((a, b) => String(b.releasedAt ?? b.createdAt ?? "").localeCompare(String(a.releasedAt ?? a.createdAt ?? "")));
}

async function loadReviewBookings(supabase: SupabaseClient): Promise<ReviewBookingRow[]> {
  const withMeta = await supabase
    .from(BOOKINGS_TABLE)
    .select(STUCK_SHIFT_REVIEW_BOOKING_SELECT)
    .eq("requires_admin_review", true)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (!withMeta.error) {
    return (withMeta.data as ReviewBookingRow[] | null) ?? [];
  }

  if (!isPostgrestMissingColumnError(withMeta.error.message, "stuck_release_reason")) {
    throw new Error(withMeta.error.message);
  }

  const core = await supabase
    .from(BOOKINGS_TABLE)
    .select(STUCK_SHIFT_REVIEW_BOOKING_SELECT_CORE)
    .eq("requires_admin_review", true)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (core.error) {
    throw new Error(core.error.message);
  }

  return (core.data as ReviewBookingRow[] | null) ?? [];
}

async function loadSessionsForBookings(
  supabase: SupabaseClient,
  bookingIds: string[]
): Promise<ReviewSessionRow[]> {
  if (bookingIds.length === 0) return [];

  const withShakes = await supabase
    .from(SESSIONS_TABLE)
    .select(STUCK_SHIFT_REVIEW_SESSION_SELECT)
    .in("booking_id", bookingIds)
    .order("created_at", { ascending: false });

  if (!withShakes.error) {
    return (withShakes.data as ReviewSessionRow[] | null) ?? [];
  }

  const core = await supabase
    .from(SESSIONS_TABLE)
    .select("id, booking_id, status, start_time, end_time")
    .in("booking_id", bookingIds)
    .order("created_at", { ascending: false });

  if (core.error) {
    return [];
  }

  return (core.data as ReviewSessionRow[] | null) ?? [];
}

async function loadProfileNames(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Record<string, { first_name?: string | null; last_name?: string | null }>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return {};

  const { data, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", unique);

  if (error || !data) return {};

  const byId: Record<string, { first_name?: string | null; last_name?: string | null }> = {};
  for (const row of data as Array<{ id?: string; first_name?: string | null; last_name?: string | null }>) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    byId[id] = { first_name: row.first_name, last_name: row.last_name };
  }
  return byId;
}

export async function listStuckShiftReviews(supabase: SupabaseClient): Promise<StuckShiftReviewCase[]> {
  const bookings = await loadReviewBookings(supabase);
  const bookingIds = bookings
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);
  const [sessions, profilesById] = await Promise.all([
    loadSessionsForBookings(supabase, bookingIds),
    loadProfileNames(
      supabase,
      bookings.flatMap((row) => [String(row.parent_id ?? ""), String(row.sitter_id ?? "")])
    )
  ]);
  return mapStuckShiftReviewCases(bookings, sessions, profilesById);
}
