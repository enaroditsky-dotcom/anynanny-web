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
export type { BookingStatus };

export const NO_ACTIVE_SHIFT_LABEL = "אין משמרת פעילה";

const MINUTES_PER_DAY = 24 * 60;
const UPCOMING_LEAD_MS = SHIFT_ACTIVATION_LEAD_MS; // 10 דקות במילשניות

function isHardTerminalStatus(status: BookingStatus | undefined): boolean {
  return status === "rejected" || status === "cancelled";
}

type ShiftWindow = {
  startMs: number;
  endMs: number;
};

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

export function buildShiftWindowMs(
  booking: Pick<BookingRow, "start_time" | "end_time">,
  nowMs: number
): ShiftWindow | null {
  if (!booking.start_time || !booking.end_time) return null;

  const startMinutes = getMinutesSinceMidnight(booking.start_time);
  const endMinutes = getMinutesSinceMidnight(booking.end_time);

  let startMs = minutesToMsOnDay(startMinutes, nowMs);
  let endMs = minutesToMsOnDay(endMinutes, nowMs);

  // אם המשמרת חוצה את חצות, נקפיץ את סיום המשמרת ליום המחרת
  if (endMinutes < startMinutes || endMs <= startMs) {
    endMs += MINUTES_PER_DAY * 60 * 1000;
  }

  return { startMs, endMs };
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

    if (completedShift || !booking?.start_time || !booking?.end_time) {
      return inactive;
    }

    const normalizedStatus = statusKey as BookingStatus | "";
    if (isHardTerminalStatus(normalizedStatus || undefined)) {
      return inactive;
    }

    // בניית חלון זמן אבסולוטי מדויק
    const window = buildShiftWindowMs(booking, nowMs);
    if (!window) return inactive;

    let { startMs, endMs } = window;

    // תיקון קריטי לחצות הלילה: אם השעה עכשיו היא לקראת חצות (למשל 23:55) והמשמרת רשומה ב-00:03,
    // ה-buildShiftWindowMs עלול לשים את startMs בתחילת היום הנוכחי (כלומר 00:03 של הבוקר שכבר עבר).
    // אם המשמרת היא בעתיד הקרוב מאוד (בתוך פחות מ-12 שעות מהרגע), נתקן את חלון הזמנים קדימה/אחורה בהתאם.
    const twelveHoursInMs = 12 * 60 * 60 * 1000;
    if (nowMs > endMs && nowMs - startMs > twelveHoursInMs) {
      startMs += MINUTES_PER_DAY * 60 * 1000;
      endMs += MINUTES_PER_DAY * 60 * 1000;
    } else if (nowMs < startMs && startMs - nowMs > twelveHoursInMs) {
      startMs -= MINUTES_PER_DAY * 60 * 1000;
      endMs -= MINUTES_PER_DAY * 60 * 1000;
    }

    // בדיקות טווחי זמן מבוססות חלון אבסולוטי
    const withinShiftHours = nowMs >= startMs && nowMs <= endMs;
    const isUpcomingPreview = nowMs >= (startMs - UPCOMING_LEAD_MS) && nowMs < startMs;

    const active = withinShiftHours;
    const isUpcoming = withinShiftHours || isUpcomingPreview;

    let secondsUntilActive = 0;
    if (nowMs < startMs) {
      secondsUntilActive = Math.max(0, Math.floor((startMs - nowMs) / 1000));
    }

    const startMinutes = getMinutesSinceMidnight(booking.start_time);

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