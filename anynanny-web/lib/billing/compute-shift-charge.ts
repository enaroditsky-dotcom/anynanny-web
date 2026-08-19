import { PARENT_PLATFORM_FEE_MULTIPLIER } from "@/lib/sitter/public-search-card";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { SESSIONS_TABLE } from "@/lib/billing/session-types";
import type { SupabaseClient } from "@supabase/supabase-js";

export { PARENT_PLATFORM_FEE_MULTIPLIER } from "@/lib/sitter/public-search-card";

/** Booking statuses that may proceed to Hyp checkout after (or during) confirm-end. */
export const PAYABLE_BOOKING_STATUSES = [
  "completed",
  "sitter_ended",
  "parent_started"
] as const;

export type PayableBookingStatus = (typeof PAYABLE_BOOKING_STATUSES)[number];

export type ShiftChargeInputs = {
  startTime: string;
  endTime: string;
  hourlyRateNis: number;
  platformFeeMultiplier?: number;
};

export type ShiftCharge = {
  elapsedSeconds: number;
  sitterBaseNis: number;
  parentTotalNis: number;
  amountMinorUnits: number;
  hourlyRateNis: number;
  platformFeeMultiplier: number;
};

export type AuthoritativeShiftCharge = ShiftCharge & {
  bookingId: string;
  sessionId: string;
  usedStoredFinals: boolean;
};

export type ComputeShiftChargeResult =
  | { ok: true; charge: AuthoritativeShiftCharge }
  | { ok: false; error: string; status: 400 | 403 | 404 | 500 };

const PAYABLE_STATUS_SET = new Set<string>(PAYABLE_BOOKING_STATUSES);

function parseTimestampMs(value: string | null | undefined): number | null {
  if (value == null || String(value).trim() === "") return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Match current V1 client rounding: two decimal NIS via toFixed(2). */
export function roundNisToCents(value: number): number {
  return Number(Math.max(0, value).toFixed(2));
}

export function elapsedSecondsFromRange(startTime: string, endTime: string): number | null {
  const startMs = parseTimestampMs(startTime);
  const endMs = parseTimestampMs(endTime);
  if (startMs == null || endMs == null) return null;
  return Math.max(0, Math.floor((endMs - startMs) / 1000));
}

/**
 * Exact current V1 product formula (pro-rata seconds, no 10% fee while multiplier is 1).
 * Hyp checkout floor: 50 agorot.
 */
export function computeShiftChargeFromTrustedInputs(input: ShiftChargeInputs): ShiftCharge | null {
  const rate = Number(input.hourlyRateNis);
  if (!Number.isFinite(rate) || rate <= 0) return null;

  const elapsedSeconds = elapsedSecondsFromRange(input.startTime, input.endTime);
  if (elapsedSeconds == null) return null;

  const multiplier =
    input.platformFeeMultiplier != null && Number.isFinite(input.platformFeeMultiplier)
      ? input.platformFeeMultiplier
      : PARENT_PLATFORM_FEE_MULTIPLIER;

  const sitterBaseNis = roundNisToCents((elapsedSeconds / 3600) * rate);
  const parentTotalNis = roundNisToCents(sitterBaseNis * multiplier);
  const amountMinorUnits = Math.max(50, Math.round(parentTotalNis * 100));

  return {
    elapsedSeconds,
    sitterBaseNis,
    parentTotalNis,
    amountMinorUnits,
    hourlyRateNis: rate,
    platformFeeMultiplier: multiplier
  };
}

export type StoredShiftFinals = {
  startTime?: string | null;
  endTime?: string | null;
  hourlyRateNis: number;
  finalElapsedSeconds?: number | null;
  finalAmountNis?: number | null;
  totalAmountCharged?: number | null;
};

/**
 * Stored finals are trusted only when they match the timestamp/rate formula
 * (i.e. they look like output from corrected end_shift_atomic).
 */
export function storedFinalsAreConsistent(stored: StoredShiftFinals): boolean {
  const start = stored.startTime != null ? String(stored.startTime).trim() : "";
  const end = stored.endTime != null ? String(stored.endTime).trim() : "";
  if (!start || !end) return false;

  const computed = computeShiftChargeFromTrustedInputs({
    startTime: start,
    endTime: end,
    hourlyRateNis: stored.hourlyRateNis
  });
  if (!computed) return false;

  const storedElapsed = Number(stored.finalElapsedSeconds);
  if (!Number.isInteger(storedElapsed) || storedElapsed !== computed.elapsedSeconds) {
    return false;
  }

  const storedAmount = Number(
    stored.finalAmountNis != null ? stored.finalAmountNis : stored.totalAmountCharged
  );
  if (!Number.isFinite(storedAmount)) return false;

  return roundNisToCents(storedAmount) === computed.sitterBaseNis;
}

export function resolveShiftChargeFromSessionFields(stored: StoredShiftFinals): ShiftCharge | null {
  if (storedFinalsAreConsistent(stored)) {
    const computed = computeShiftChargeFromTrustedInputs({
      startTime: String(stored.startTime),
      endTime: String(stored.endTime),
      hourlyRateNis: stored.hourlyRateNis
    });
    return computed;
  }

  const start = stored.startTime != null ? String(stored.startTime).trim() : "";
  const end = stored.endTime != null ? String(stored.endTime).trim() : "";
  if (!start || !end) return null;

  return computeShiftChargeFromTrustedInputs({
    startTime: start,
    endTime: end,
    hourlyRateNis: stored.hourlyRateNis
  });
}

function isPayableBookingStatus(status: unknown): boolean {
  return PAYABLE_STATUS_SET.has(String(status ?? "").trim().toLowerCase());
}

/**
 * Server-only: derive the Hyp charge from booking + session rows.
 * Ignores any browser-supplied amount / elapsed.
 */
export async function computeAuthoritativeShiftCharge(
  supabase: SupabaseClient,
  userId: string,
  input: { bookingId: string; sessionId?: string | null }
): Promise<ComputeShiftChargeResult> {
  const bookingId = String(input.bookingId ?? "").trim();
  const requestedSessionId = String(input.sessionId ?? "").trim();
  const parentId = String(userId ?? "").trim();

  if (!bookingId) {
    return { ok: false, error: "bookingId is required.", status: 400 };
  }
  if (!parentId) {
    return { ok: false, error: "Unauthorized.", status: 403 };
  }

  const { data: booking, error: bookingErr } = await supabase
    .from(BOOKINGS_TABLE)
    .select("id, parent_id, status, payment_status, paid_at, hourly_rate_nis")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingErr) {
    return { ok: false, error: "Failed to load booking.", status: 500 };
  }
  if (!booking) {
    return { ok: false, error: "Booking not found.", status: 404 };
  }

  if (String(booking.parent_id) !== parentId) {
    return { ok: false, error: "Forbidden.", status: 403 };
  }

  if (!isPayableBookingStatus(booking.status)) {
    return { ok: false, error: "This booking cannot be paid in its current state.", status: 400 };
  }

  const rate = Number((booking as { hourly_rate_nis?: unknown }).hourly_rate_nis);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { ok: false, error: "Booking is missing a valid hourly rate snapshot.", status: 400 };
  }

  type SessionChargeRow = {
    id: string;
    parent_id: string;
    booking_id?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    final_elapsed_seconds?: number | null;
    final_amount_nis?: number | null;
    total_amount_charged?: number | null;
  };

  const sessionSelect =
    "id, parent_id, booking_id, start_time, end_time, final_elapsed_seconds, final_amount_nis, total_amount_charged";

  let session: SessionChargeRow | null = null;

  if (requestedSessionId) {
    const { data, error } = await supabase
      .from(SESSIONS_TABLE)
      .select(sessionSelect)
      .eq("id", requestedSessionId)
      .maybeSingle();
    if (error) {
      return { ok: false, error: "Failed to load session.", status: 500 };
    }
    session = (data as SessionChargeRow | null) ?? null;
  }

  if (!session) {
    const { data: byBooking, error: byBookingErr } = await supabase
      .from(SESSIONS_TABLE)
      .select(sessionSelect)
      .eq("booking_id", bookingId)
      .eq("parent_id", parentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byBookingErr) {
      const { data: byId, error: byIdErr } = await supabase
        .from(SESSIONS_TABLE)
        .select(sessionSelect)
        .eq("id", bookingId)
        .eq("parent_id", parentId)
        .maybeSingle();
      if (byIdErr) {
        return { ok: false, error: "Failed to load session.", status: 500 };
      }
      session = (byId as SessionChargeRow | null) ?? null;
    } else {
      session = (byBooking as SessionChargeRow | null) ?? null;
    }
  }

  if (!session && !requestedSessionId) {
    const { data: latest, error: latestErr } = await supabase
      .from(SESSIONS_TABLE)
      .select(sessionSelect)
      .eq("parent_id", parentId)
      .in("status", ["payment_pending", "sitter_completed", "completed", "paid"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestErr) {
      return { ok: false, error: "Failed to load session.", status: 500 };
    }
    session = (latest as SessionChargeRow | null) ?? null;
  }

  if (!session) {
    return { ok: false, error: "No payable session found for this booking.", status: 400 };
  }

  if (String(session.parent_id) !== parentId) {
    return { ok: false, error: "Forbidden.", status: 403 };
  }

  const linkedBookingId =
    session.booking_id != null && String(session.booking_id).trim() !== ""
      ? String(session.booking_id).trim()
      : null;
  if (linkedBookingId && linkedBookingId !== bookingId) {
    return { ok: false, error: "Session does not belong to this booking.", status: 400 };
  }

  const startTime = session.start_time != null ? String(session.start_time).trim() : "";
  const endTime = session.end_time != null ? String(session.end_time).trim() : "";
  if (!startTime) {
    return { ok: false, error: "Session is missing start_time.", status: 400 };
  }
  if (!endTime) {
    return { ok: false, error: "Session has not been ended yet.", status: 400 };
  }

  const usedStoredFinals = storedFinalsAreConsistent({
    startTime,
    endTime,
    hourlyRateNis: rate,
    finalElapsedSeconds: session.final_elapsed_seconds,
    finalAmountNis: session.final_amount_nis,
    totalAmountCharged: session.total_amount_charged
  });

  const charge = resolveShiftChargeFromSessionFields({
    startTime,
    endTime,
    hourlyRateNis: rate,
    finalElapsedSeconds: session.final_elapsed_seconds,
    finalAmountNis: session.final_amount_nis,
    totalAmountCharged: session.total_amount_charged
  });

  if (!charge) {
    return { ok: false, error: "Unable to compute shift charge from stored times.", status: 400 };
  }

  return {
    ok: true,
    charge: {
      ...charge,
      bookingId,
      sessionId: String(session.id),
      usedStoredFinals
    }
  };
}
