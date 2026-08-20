"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKINGS_TABLE, type BookingRow } from "@/lib/bookings/constants";

/**
 * Parent-dashboard rejection notification dismissals.
 *
 * Primary persistence: `bookings.parent_notified_at` (parent + booking scoped in DB).
 * Secondary cache: localStorage for immediate UI + pre-migration fallback.
 */

const STORAGE_PREFIX = "anynanny_dismissed_rejected_bookings_v1";

export function dismissedRejectedBookingsStorageKey(parentId: string): string {
  return `${STORAGE_PREFIX}:${String(parentId).trim()}`;
}

export function isRejectedWithNoteBooking(
  booking: Pick<BookingRow, "status" | "rejection_note"> | null | undefined
): boolean {
  if (!booking) return false;
  const status = String(booking.status ?? "").trim().toLowerCase();
  return status === "rejected" && Boolean(booking.rejection_note);
}

/** True when the parent has not yet dismissed the rejection notification. */
export function shouldShowRejectedNotification(
  booking:
    | Pick<BookingRow, "id" | "status" | "rejection_note" | "parent_notified_at">
    | null
    | undefined,
  dismissedLocalIds?: Set<string>
): boolean {
  if (!isRejectedWithNoteBooking(booking)) return false;
  if (booking?.parent_notified_at) return false;
  if (dismissedLocalIds?.has(String(booking?.id ?? ""))) return false;
  return true;
}

export function readDismissedRejectedBookingIds(parentId: string | null | undefined): Set<string> {
  if (typeof window === "undefined") return new Set();
  const uid = String(parentId ?? "").trim();
  if (!uid) return new Set();
  try {
    const raw = window.localStorage.getItem(dismissedRejectedBookingsStorageKey(uid));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    );
  } catch {
    return new Set();
  }
}

/** Local cache — used immediately on dismiss and when DB column is unavailable. */
export function persistDismissedRejectedBookingId(
  parentId: string | null | undefined,
  bookingId: string
): void {
  if (typeof window === "undefined") return;
  const uid = String(parentId ?? "").trim();
  const id = String(bookingId ?? "").trim();
  if (!uid || !id) return;
  try {
    const next = readDismissedRejectedBookingIds(uid);
    next.add(id);
    window.localStorage.setItem(
      dismissedRejectedBookingsStorageKey(uid),
      JSON.stringify([...next])
    );
  } catch {
    /* ignore */
  }
}

/**
 * Persist rejection notification acknowledgement for parent + booking.
 * Does NOT change booking.status — only sets parent_notified_at when available.
 */
export async function acknowledgeRejectedBookingNotification(
  supabase: SupabaseClient,
  parentId: string,
  bookingId: string
): Promise<{ ok: boolean; error: string | null }> {
  const uid = String(parentId ?? "").trim();
  const id = String(bookingId ?? "").trim();
  if (!uid || !id) {
    return { ok: false, error: "missing parent or booking id" };
  }

  persistDismissedRejectedBookingId(uid, id);

  const acknowledgedAt = new Date().toISOString();
  const { error } = await supabase
    .from(BOOKINGS_TABLE)
    .update({ parent_notified_at: acknowledgedAt })
    .eq("id", id)
    .eq("parent_id", uid)
    .eq("status", "rejected");

  const { markNotificationsReadBestEffort } = await import("@/lib/notifications/read-state");
  await markNotificationsReadBestEffort(supabase, uid, {
    kind: "booking_rejected",
    bookingId: id
  });

  if (!error) {
    return { ok: true, error: null };
  }

  const message = error.message ?? String(error);
  if (/column|parent_notified_at|schema cache|could not find|does not exist/i.test(message)) {
    // Pre-migration environments: localStorage cache still hides the card.
    return { ok: true, error: null };
  }

  return { ok: false, error: message };
}
