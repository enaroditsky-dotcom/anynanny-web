"use client";

import { useEffect, useState } from "react";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { SHIFT_ACTIVATION_LEAD_MS } from "@/lib/bookings/booking-shift-ui";
import type { BillingSessionRow } from "@/lib/billing/session-billing";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type BillingLifecyclePhase =
  | "PENDING_START"
  | "TRIGGER_WINDOW_OPEN"
  | "WAITING_PARENT_START_SHAKE"
  | "ACTIVE_RUNNING"
  | "WAITING_PARENT_END_SHAKE"
  | "COMPLETED_AND_REVIEW";

/** Strict Double-Shake statuses — UI routes on these literals only (no shake inference). */
export type StrictSessionStatus =
  | "confirmed"
  | "sitter_started"
  | "in_progress"
  | "sitter_ended"
  | "completed";

const STRICT_SESSION_STATUSES = new Set<string>([
  "confirmed",
  "sitter_started",
  "in_progress",
  "sitter_ended",
  "completed"
]);

/** Returns the literal `session_status` from the DB row, or null if missing/unknown. */
export function readStrictSessionStatus(
  row: BillingSessionRow | null | undefined
): StrictSessionStatus | null {
  if (!row?.session_status) return null;
  const status = row.session_status.trim().toLowerCase();
  if (!STRICT_SESSION_STATUSES.has(status)) return null;
  return status as StrictSessionStatus;
}

/** @deprecated Use readStrictSessionStatus — no shake overrides. */
export function resolveDoubleShakeSessionPhase(
  row: BillingSessionRow | null | undefined
): StrictSessionStatus | null {
  return readStrictSessionStatus(row);
}

export function shakeSet(value: string | null | undefined): boolean {
  return value != null && String(value).trim() !== "";
}

export function allFourShakesNull(row: BillingSessionRow): boolean {
  return (
    !shakeSet(row.sitter_start_shake) &&
    !shakeSet(row.parent_start_shake) &&
    !shakeSet(row.sitter_end_shake) &&
    !shakeSet(row.parent_end_shake)
  );
}

/** Strict chronological resolver — orphan/backfilled timestamps cannot skip phases. */
export function resolveBillingLifecyclePhase(
  row: BillingSessionRow | null,
  scheduledStartMs: number | null,
  nowMs: number
): BillingLifecyclePhase | null {
  if (!row) return null;

  const sitterStart = shakeSet(row.sitter_start_shake);
  const parentStart = shakeSet(row.parent_start_shake);
  const sitterEnd = shakeSet(row.sitter_end_shake);
  const parentEnd = shakeSet(row.parent_end_shake);

  if (sitterStart && parentStart && sitterEnd && parentEnd) {
    return "COMPLETED_AND_REVIEW";
  }

  if (sitterStart && parentStart && sitterEnd && !parentEnd) {
    return "WAITING_PARENT_END_SHAKE";
  }

  if (sitterStart && parentStart && !sitterEnd) {
    return "ACTIVE_RUNNING";
  }

  if (sitterStart && !parentStart) {
    return "WAITING_PARENT_START_SHAKE";
  }

  if (allFourShakesNull(row)) {
    if (scheduledStartMs != null && nowMs < scheduledStartMs - SHIFT_ACTIVATION_LEAD_MS) {
      return "PENDING_START";
    }
    return "TRIGGER_WINDOW_OPEN";
  }

  if (!sitterStart) {
    if (allFourShakesNull(row) || (!parentStart && !sitterEnd && !parentEnd)) {
      if (scheduledStartMs != null && nowMs < scheduledStartMs - SHIFT_ACTIVATION_LEAD_MS) {
        return "PENDING_START";
      }
      return "TRIGGER_WINDOW_OPEN";
    }
  }

  return "TRIGGER_WINDOW_OPEN";
}

export function formatScheduledShiftTime(scheduledStartMs: number): string {
  return new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(scheduledStartMs));
}

export function computeLiveElapsedSeconds(parentStartIso: string, nowMs: number): number {
  const startMs = new Date(parentStartIso).getTime();
  if (!Number.isFinite(startMs)) return 0;
  return Math.max(0, Math.floor((nowMs - startMs) / 1000));
}

export function computeFrozenDurationSeconds(row: BillingSessionRow): number {
  if (!shakeSet(row.parent_start_shake) || !shakeSet(row.sitter_end_shake)) return 0;
  const startMs = new Date(row.parent_start_shake!).getTime();
  const endMs = new Date(row.sitter_end_shake!).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.floor((endMs - startMs) / 1000));
}

/** Wall clock for pre-start window transitions and live running timer. */
export function useBillingWallClock(active: boolean, intervalMs = 250): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const tick = () => setNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);

  return nowMs;
}

function bookingScheduledStartMs(bookingDate: string, startTime: string): number | null {
  const datePart = bookingDate.trim();
  const timePart = startTime.trim();
  if (!datePart || !timePart) return null;

  if (timePart.includes("T")) {
    const isoMs = new Date(timePart).getTime();
    return Number.isFinite(isoMs) ? isoMs : null;
  }

  const combined = `${datePart}T${timePart.length <= 5 ? `${timePart}:00` : timePart}`;
  const ms = new Date(combined).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Booking scheduled start (ms). `undefined` = loading, `null` = no booking / unknown → trigger window open. */
export function useBillingScheduledStartMs(bookingId: string | null | undefined): number | null | undefined {
  const [scheduledStartMs, setScheduledStartMs] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    if (!bookingId) {
      setScheduledStartMs(null);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setScheduledStartMs(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      const { data, error } = await supabase
        .from(BOOKINGS_TABLE)
        .select("booking_date, start_time")
        .eq("id", bookingId)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data?.start_time) {
        setScheduledStartMs(null);
        return;
      }

      const ms = bookingScheduledStartMs(String(data.booking_date ?? ""), String(data.start_time));
      setScheduledStartMs(ms);
    })();

    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  return scheduledStartMs;
}
