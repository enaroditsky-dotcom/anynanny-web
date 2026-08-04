import type { SessionProtocolState, SupabaseSessionRow } from "@/lib/session/protocol";

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Floor whole minutes between start and end (billing granularity). */
export function computeExactMinutesFromSession(row: Pick<SupabaseSessionRow, "start_time" | "end_time">): number {
  if (!row.start_time || !row.end_time) return 0;
  const startMs = new Date(row.start_time).getTime();
  const endMs = new Date(row.end_time).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.floor((endMs - startMs) / 60000));
}

/** Elapsed seconds for HH:MM:SS — prefers DB `final_elapsed_seconds`, else wall diff. */
export function computeElapsedSecondsFromSession(
  row: Pick<SupabaseSessionRow, "start_time" | "end_time" | "final_elapsed_seconds">
): number {
  if (row.final_elapsed_seconds != null && Number.isFinite(Number(row.final_elapsed_seconds))) {
    return Math.max(0, Math.floor(Number(row.final_elapsed_seconds)));
  }
  if (!row.start_time || !row.end_time) return 0;
  const startMs = new Date(row.start_time).getTime();
  const endMs = new Date(row.end_time).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.floor((endMs - startMs) / 1000));
}

export function computeAmountNisForCompletedSession(
  row: Pick<SupabaseSessionRow, "final_amount_nis">,
  hourlyRateNis: number,
  exactMinutes: number
): number {
  if (row.final_amount_nis != null && Number.isFinite(Number(row.final_amount_nis))) {
    return roundTwo(Number(row.final_amount_nis));
  }
  const rate = Number.isFinite(hourlyRateNis) && hourlyRateNis > 0 ? hourlyRateNis : 0;
  return roundTwo((rate / 60) * exactMinutes);
}

/** Build display totals for a mapped `ended` protocol state (parent dashboard). */
export function completedSummaryFromEndedState(
  state: SessionProtocolState,
  hourlyRateFallback: number
): { elapsedSeconds: number; amountNis: number } | null {
  if (state.status !== "ended") return null;
  const row: Pick<SupabaseSessionRow, "start_time" | "end_time" | "final_elapsed_seconds" | "final_amount_nis"> = {
    start_time: state.parentStartedAtMs != null ? new Date(state.parentStartedAtMs).toISOString() : null,
    end_time: state.endedAtMs != null ? new Date(state.endedAtMs).toISOString() : null,
    final_elapsed_seconds: state.finalElapsedSeconds ?? null,
    final_amount_nis: state.finalAmountNis ?? null
  };
  const exactMinutes = computeExactMinutesFromSession(row);
  const elapsedSeconds = computeElapsedSecondsFromSession(row);
  const amountNis = computeAmountNisForCompletedSession(row, hourlyRateFallback, exactMinutes);
  return { elapsedSeconds, amountNis };
}

export function completedSummaryFromSessionRow(
  row: SupabaseSessionRow,
  hourlyRateFallback: number
): { elapsedSeconds: number; amountNis: number } {
  const exactMinutes = computeExactMinutesFromSession(row);
  const elapsedSeconds = computeElapsedSecondsFromSession(row);
  const amountNis = computeAmountNisForCompletedSession(row, hourlyRateFallback, exactMinutes);
  return { elapsedSeconds, amountNis };
}
