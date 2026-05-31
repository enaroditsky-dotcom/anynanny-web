import { useEffect, useMemo, useRef, useState } from "react";
import type { BookingRow, BookingStatus } from "@/lib/bookings/constants";
import { SHIFT_ACTIVATION_LEAD_MS } from "@/lib/bookings/booking-shift-constants";
import {
  normalizeBookingStatus,
  type BookingStatusInput
} from "@/lib/bookings/booking-status-normalize";
import { isBookingTerminalStatus } from "@/lib/bookings/booking-shift-ui";

export { SHIFT_ACTIVATION_LEAD_MS } from "@/lib/bookings/booking-shift-constants";
export { normalizeBookingStatus, type BookingStatusInput } from "@/lib/bookings/booking-status-normalize";

export const NO_ACTIVE_SHIFT_LABEL = "אין משמרת פעילה";

const MINUTES_PER_DAY = 24 * 60;
const UPCOMING_LEAD_MINUTES = SHIFT_ACTIVATION_LEAD_MS / (60 * 1000);

/** Shift is permanently closed before the wall clock is evaluated. */
function isHardTerminalStatus(status: BookingStatus | undefined): boolean {
  return status === "rejected" || status === "cancelled";
}

type ShiftWindow = {
  startMs: number;
  endMs: number;
};

/** Safely extract local minutes since midnight from minutes-int, "HH:MM", "HH:MM:SS", or ISO. */
export function getMinutesSinceMidnight(timeStr: string): number {
  const trimmed = timeStr.trim();
  if (!trimmed) return 0;

  if (/^\d+$/.test(trimmed)) {
    const asInt = Number(trimmed);
    if (Number.isFinite(asInt) && asInt >= 0 && asInt < MINUTES_PER_DAY) {
      return asInt;
    }
  }

  if (trimmed.includes("T")) {
    const date = new Date(trimmed);
    if (Number.isFinite(date.getTime())) {
      return date.getHours() * 60 + date.getMinutes();
    }
  }

  const parts = trimmed.split(":");
  const hours = Number(parts[0]);
  const minutes = Number(parts[1] ?? 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;

  return hours * 60 + minutes;
}

/** Fail-safe same-day / cross-midnight window check on minute-of-day values. */
export function computeWithinShiftHours(
  currentMinutes: number,
  startMinutes: number,
  endMinutes: number
): boolean {
  const crossesMidnight = endMinutes < startMinutes;

  if (crossesMidnight) {
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

function minutesToMsOnDay(minutes: number, dayAnchorMs: number): number {
  const anchor = new Date(dayAnchorMs);
  anchor.setHours(Math.floor(minutes / 60) % 24, minutes % 60, 0, 0);
  return anchor.getTime();
}

function formatMinutesLabel(minutes: number): string {
  const anchor = new Date();
  anchor.setHours(Math.floor(minutes / 60) % 24, minutes % 60, 0, 0);
  return anchor.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isUpcomingMinutes(
  currentMinutes: number,
  startMinutes: number,
  leadMinutes: number = UPCOMING_LEAD_MINUTES
): boolean {
  const previewStartMinutes = (startMinutes - leadMinutes + MINUTES_PER_DAY) % MINUTES_PER_DAY;

  if (previewStartMinutes < startMinutes) {
    return currentMinutes >= previewStartMinutes && currentMinutes < startMinutes;
  }

  return currentMinutes >= previewStartMinutes || currentMinutes < startMinutes;
}

function minutesUntilUpcoming(
  currentMinutes: number,
  startMinutes: number,
  leadMinutes: number = UPCOMING_LEAD_MINUTES
): number {
  const previewStartMinutes = (startMinutes - leadMinutes + MINUTES_PER_DAY) % MINUTES_PER_DAY;

  if (previewStartMinutes < startMinutes) {
    if (currentMinutes < previewStartMinutes) {
      return previewStartMinutes - currentMinutes;
    }

    if (currentMinutes >= startMinutes) {
      return MINUTES_PER_DAY - currentMinutes + previewStartMinutes;
    }

    return 0;
  }

  if (currentMinutes >= previewStartMinutes || currentMinutes < startMinutes) {
    return 0;
  }

  return previewStartMinutes - currentMinutes;
}

/** Resolve start/end epoch-ms on the local calendar day anchored to `nowMs`. */
export function buildShiftWindowMs(
  booking: Pick<BookingRow, "start_time" | "end_time">,
  nowMs: number
): ShiftWindow | null {
  if (!booking.start_time || !booking.end_time) return null;

  const startMinutes = getMinutesSinceMidnight(booking.start_time);
  const endMinutes = getMinutesSinceMidnight(booking.end_time);

  let startMs = minutesToMsOnDay(startMinutes, nowMs);
  let endMs = minutesToMsOnDay(endMinutes, nowMs);

  if (endMinutes < startMinutes || endMs <= startMs) {
    endMs += MINUTES_PER_DAY * 60 * 1000;
  }

  return { startMs, endMs };
}

/** Current live time is inside scheduled shift hours. */
export function isActiveForLocalWindow(
  status: BookingStatusInput,
  booking: Pick<BookingRow, "start_time" | "end_time">,
  nowMs: number
): boolean {
  const currentStatus = normalizeBookingStatus(status);
  if (!currentStatus || isBookingTerminalStatus(currentStatus)) return false;
  if (!booking.start_time || !booking.end_time) return false;

  const now = new Date(nowMs);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = getMinutesSinceMidnight(booking.start_time);
  const endMinutes = getMinutesSinceMidnight(booking.end_time);

  return computeWithinShiftHours(currentMinutes, startMinutes, endMinutes);
}

/** Current live time is in the 10-minute preview before scheduled start. */
export function isUpcomingForLocalWindow(
  status: BookingStatusInput,
  booking: Pick<BookingRow, "start_time" | "end_time">,
  nowMs: number
): boolean {
  const currentStatus = normalizeBookingStatus(status);
  if (!currentStatus || isBookingTerminalStatus(currentStatus)) return false;
  if (!booking.start_time || !booking.end_time) return false;

  const now = new Date(nowMs);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = getMinutesSinceMidnight(booking.start_time);

  return isUpcomingMinutes(currentMinutes, startMinutes);
}

export function useShiftActivationStatus(
  booking: (Pick<BookingRow, "id" | "start_time" | "end_time"> & { status?: BookingStatusInput }) | null
) {
  const currentStatus =
    typeof booking?.status === "object" && booking?.status !== null
      ? (booking.status as { name?: BookingStatus }).name
      : booking?.status;

  const statusKey =
    typeof currentStatus === "string"
      ? currentStatus
      : normalizeBookingStatus(currentStatus) ?? "";

  const completedShift = statusKey === "completed";

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (completedShift) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [completedShift]);

  const computed = useMemo(() => {
    const inactive = {
      active: false,
      isUpcoming: false,
      withinShiftHours: false,
      secondsUntilActive: 0,
      startTimeLabel: ""
    };

    if (statusKey === "completed") {
      return inactive;
    }

    if (!booking?.start_time || !booking?.end_time) {
      return inactive;
    }

    const normalizedStatus = statusKey as BookingStatus | "";
    const isHardTerminal = isHardTerminalStatus(normalizedStatus || undefined);

    if (isHardTerminal) {
      return inactive;
    }

    const now = new Date(nowMs);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = getMinutesSinceMidnight(booking.start_time);
    const endMinutes = getMinutesSinceMidnight(booking.end_time);

    const crossesMidnight = endMinutes < startMinutes;
    const withinShiftHours = crossesMidnight
      ? currentMinutes >= startMinutes || currentMinutes <= endMinutes
      : currentMinutes >= startMinutes && currentMinutes <= endMinutes;

    const isUpcomingPreview = isUpcomingMinutes(currentMinutes, startMinutes);

    const active = withinShiftHours;
    const isUpcoming = withinShiftHours || isUpcomingPreview;

    let secondsUntilActive = 0;
    if (!withinShiftHours && !isUpcomingPreview) {
      secondsUntilActive = minutesUntilUpcoming(currentMinutes, startMinutes) * 60;
    }

    return {
      active,
      isUpcoming,
      withinShiftHours,
      secondsUntilActive,
      startTimeLabel: formatMinutesLabel(startMinutes)
    };
  }, [booking?.id, booking?.start_time, booking?.end_time, nowMs, statusKey]);

  const activationReady = !completedShift && (computed.active || computed.isUpcoming);

  const prevActivationReadyRef = useRef(false);
  const [justActivated, setJustActivated] = useState(false);

  useEffect(() => {
    prevActivationReadyRef.current = false;
    setJustActivated(false);
  }, [booking?.id]);

  useEffect(() => {
    if (completedShift) return;
    const prev = prevActivationReadyRef.current;
    prevActivationReadyRef.current = activationReady;
    if (!prev && activationReady) {
      setJustActivated(true);
    }
  }, [activationReady, completedShift]);

  useEffect(() => {
    if (!justActivated || completedShift) return;
    const timeoutId = globalThis.setTimeout(() => setJustActivated(false), 4000);
    return () => globalThis.clearTimeout(timeoutId);
  }, [justActivated, completedShift]);

  return {
    active: computed.active,
    isUpcoming: computed.isUpcoming,
    withinShiftHours: computed.withinShiftHours,
    justActivated: completedShift ? false : justActivated,
    secondsUntilActive: computed.secondsUntilActive,
    startTimeLabel: computed.startTimeLabel
  };
}
