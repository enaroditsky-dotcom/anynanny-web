import type { BookingStatus } from "@/lib/bookings/use-shift-activation-status";
import {
  SESSION_PENDING_START_STATUSES,
  type SessionProtocolState,
  type SupabaseSessionRow
} from "@/lib/session/protocol";
import { parentSessionStateFromSupabaseRow } from "@/lib/session/dismissed-completed";
import {
  fetchLatestParentSessionRow,
  fetchSessionForBooking,
  readSessionLinkedBookingId
} from "@/lib/session/sessions-query";
import type { SupabaseClient } from "@supabase/supabase-js";

const LIVE_BOOKING_STATUSES = new Set<BookingStatus>([
  "pending",
  "approved",
  "sitter_started",
  "parent_started",
  "in_progress",
  "sitter_ended"
]);

const CLOSURE_BOOKING_STATUSES = new Set<BookingStatus>(["completed"]);

export function isClosureBookingStatus(status: BookingStatus | null | undefined): boolean {
  return status != null && CLOSURE_BOOKING_STATUSES.has(status);
}

export function resolveParentClosureBookingId(
  sessionLinkedBookingId: string | undefined,
  todaysBookingId: string | undefined,
  todaysBookingStatus?: BookingStatus | null
): string {
  const todayId = todaysBookingId?.trim() ?? "";
  const sessionId = sessionLinkedBookingId?.trim() ?? "";
  if (todayId && isClosureBookingStatus(todaysBookingStatus ?? undefined)) {
    return todayId;
  }
  return sessionId || todayId;
}

export function isDbSessionCompletedRow(row: SupabaseSessionRow | null | undefined): boolean {
  if (!row) return false;
  if (String(row.status) !== "completed") return false;
  return row.end_time != null && String(row.end_time).trim().length > 0;
}

export function canShowParentSessionClosure(params: {
  sessionState: SessionProtocolState;
  completedSummary: { elapsedSeconds: number; amountNis: number } | null;
  bookingStatus: BookingStatus | null | undefined;
}): boolean {
  const { sessionState, completedSummary, bookingStatus } = params;
  if (sessionState.status !== "ended" || !completedSummary) return false;
  if (sessionState.endedAtMs == null || !sessionState.supabaseSessionId?.trim()) return false;
  if (bookingStatus != null && LIVE_BOOKING_STATUSES.has(bookingStatus)) return false;
  return isClosureBookingStatus(bookingStatus);
}

export function mergeParentSessionFromDbRow(
  row: SupabaseSessionRow,
  ctx: {
    dismissedCompletedSessionId: string | null;
    todaysBookingId: string;
    localState: SessionProtocolState;
    bookingStatus?: BookingStatus | null;
  }
): SessionProtocolState | null {
  const mapped = parentSessionStateFromSupabaseRow(row, ctx.dismissedCompletedSessionId);
  if (!mapped) return null;

  const rowBookingId = readSessionLinkedBookingId(row, ctx.todaysBookingId);
  const linkedToToday =
    !ctx.todaysBookingId || !rowBookingId || rowBookingId === ctx.todaysBookingId;

  if (ctx.localState.status === "ended" && isClosureBookingStatus(ctx.bookingStatus ?? undefined)) {
    if (mapped.status === "active" || mapped.status === "parent_initiated" || mapped.status === "idle") {
      return ctx.localState;
    }
  }

  if (mapped.status === "ended" && !isDbSessionCompletedRow(row)) {
    return null;
  }

  if (mapped.status === "ended" && !linkedToToday) {
    return null;
  }

  const localLive =
    ctx.localState.status === "active" || ctx.localState.status === "parent_initiated";

  if (localLive && mapped.status === "ended") {
    const sameSession =
      ctx.localState.supabaseSessionId != null &&
      String(row.id) === String(ctx.localState.supabaseSessionId);
    if (!sameSession || !isDbSessionCompletedRow(row)) {
      return {
        ...ctx.localState,
        supabaseSessionId: ctx.localState.supabaseSessionId ?? String(row.id),
        linkedBookingId: ctx.localState.linkedBookingId ?? rowBookingId ?? ctx.todaysBookingId,
        parentEndRequestedAtMs:
          mapped.parentEndRequestedAtMs ?? ctx.localState.parentEndRequestedAtMs,
        endRequested: mapped.endRequested ?? ctx.localState.endRequested
      };
    }
  }

  if (ctx.localState.status === "active" && mapped.status !== "active" && mapped.status !== "ended") {
    return {
      ...ctx.localState,
      supabaseSessionId: mapped.supabaseSessionId ?? ctx.localState.supabaseSessionId,
      linkedBookingId: ctx.localState.linkedBookingId ?? mapped.linkedBookingId ?? ctx.todaysBookingId,
      parentEndRequestedAtMs: mapped.parentEndRequestedAtMs ?? ctx.localState.parentEndRequestedAtMs,
      endRequested: mapped.endRequested ?? ctx.localState.endRequested
    };
  }

  return {
    ...mapped,
    linkedBookingId: mapped.linkedBookingId ?? ctx.todaysBookingId
  };
}

/** Prefer today's booking session; never hydrate a stale completed row over a live shift. */
export async function fetchRelevantParentSessionRow(
  supabase: SupabaseClient,
  parentUserId: string,
  todaysBookingId: string,
  todaysBookingStatus?: BookingStatus | null
): Promise<SupabaseSessionRow | null> {
  const inFlightStatuses = [...SESSION_PENDING_START_STATUSES, "active"];
  const liveBooking =
    todaysBookingStatus != null && LIVE_BOOKING_STATUSES.has(todaysBookingStatus);

  if (todaysBookingId && isClosureBookingStatus(todaysBookingStatus ?? undefined)) {
    const { row: completed, error: completedErr } = await fetchSessionForBooking(supabase, {
      parentId: parentUserId,
      bookingId: todaysBookingId,
      completedOnly: true,
      orderBy: "end_time",
      ascending: false
    });

    if (!completedErr && completed) {
      return completed;
    }
  }

  const { row: inFlight, error: inFlightErr } = await fetchLatestParentSessionRow(
    supabase,
    parentUserId,
    { statuses: inFlightStatuses, orderBy: "created_at", ascending: false }
  );

  if (!inFlightErr && inFlight) {
    return inFlight;
  }

  if (todaysBookingId && liveBooking) {
    const { row: liveForBooking, error: liveErr } = await fetchSessionForBooking(supabase, {
      parentId: parentUserId,
      bookingId: todaysBookingId,
      statuses: inFlightStatuses,
      orderBy: "created_at",
      ascending: false
    });

    if (!liveErr && liveForBooking) {
      return liveForBooking;
    }
  }

  if (!todaysBookingId) {
    return null;
  }

  const { row: completed, error: completedErr } = await fetchSessionForBooking(supabase, {
    parentId: parentUserId,
    bookingId: todaysBookingId,
    completedOnly: true,
    orderBy: "end_time",
    ascending: false
  });

  if (!completedErr && completed) {
    return completed;
  }

  return null;
}

/** Strip stale local `ended` when a live booking is still running in DB. */
export function reconcileStaleEndedLocalState(
  local: SessionProtocolState,
  bookingStatus: BookingStatus | null | undefined
): SessionProtocolState {
  if (local.status !== "ended") return local;
  if (bookingStatus != null && LIVE_BOOKING_STATUSES.has(bookingStatus)) {
    return { status: "idle" };
  }
  return local;
}
