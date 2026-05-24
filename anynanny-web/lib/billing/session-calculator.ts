/**
 * Minute-level session billing for AnyNanny Double-Shake sessions.
 *
 * Billable window: sitter-confirmed start → parent-confirmed end.
 * Amount formula: hourly_rate × (total_minutes / 60), rounded to 2 decimal places.
 */

export type BillingSessionTimestamps = {
  startTimeConfirmedBySitter?: string | Date | null;
  endTimeConfirmedByParent?: string | Date | null;
};

export type BillingSessionResult = {
  totalMinutes: number;
  totalAmount: number;
};

const MS_PER_MINUTE = 60_000;

function toEpochMs(value: string | Date): number | null {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Round currency to two decimal places (half-up). */
export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Whole billable minutes between confirmed start and confirmed end.
 * Uses floor so partial minutes are not charged until the next full minute elapses.
 */
export function calculateTotalMinutes(
  startConfirmedAt: string | Date,
  endConfirmedAt: string | Date
): number {
  const startMs = toEpochMs(startConfirmedAt);
  const endMs = toEpochMs(endConfirmedAt);

  if (startMs == null || endMs == null || endMs <= startMs) {
    return 0;
  }

  return Math.floor((endMs - startMs) / MS_PER_MINUTE);
}

/**
 * Pro-rated session charge from elapsed minutes and hourly rate.
 *
 * @example
 * calculateSessionTotalAmount(90, 60) // 90 min @ ₪60/hr → 90.00
 * calculateSessionTotalAmount(1, 50)  // 1 min @ ₪50/hr → 0.83
 */
export function calculateSessionTotalAmount(
  totalMinutes: number,
  hourlyRate: number
): number {
  if (totalMinutes <= 0 || hourlyRate <= 0) {
    return 0;
  }

  const amount = (hourlyRate / 60) * totalMinutes;
  return roundCurrency(amount);
}

/** Derive minutes and amount from Double-Shake confirmation timestamps. */
export function calculateBillingFromSession(
  timestamps: BillingSessionTimestamps,
  hourlyRate: number
): BillingSessionResult {
  const { startTimeConfirmedBySitter, endTimeConfirmedByParent } = timestamps;

  if (!startTimeConfirmedBySitter || !endTimeConfirmedByParent) {
    return { totalMinutes: 0, totalAmount: 0 };
  }

  const totalMinutes = calculateTotalMinutes(
    startTimeConfirmedBySitter,
    endTimeConfirmedByParent
  );
  const totalAmount = calculateSessionTotalAmount(totalMinutes, hourlyRate);

  return { totalMinutes, totalAmount };
}

/**
 * Live (in-progress) minute count for an active session.
 * Caps at `endTimeRequested` when end has been requested but not yet confirmed.
 */
export function calculateLiveMinutes(params: {
  startTimeConfirmedBySitter: string | Date;
  endTimeRequested?: string | Date | null;
  now?: Date;
}): number {
  const startMs = toEpochMs(params.startTimeConfirmedBySitter);
  if (startMs == null) return 0;

  const endCapMs =
    params.endTimeRequested != null
      ? toEpochMs(params.endTimeRequested)
      : (params.now ?? new Date()).getTime();

  if (endCapMs == null || endCapMs <= startMs) return 0;

  return Math.floor((endCapMs - startMs) / MS_PER_MINUTE);
}

/** Live pro-rated cost while session is active (same formula as final billing). */
export function calculateLiveAmount(
  totalMinutes: number,
  hourlyRate: number
): number {
  return calculateSessionTotalAmount(totalMinutes, hourlyRate);
}
