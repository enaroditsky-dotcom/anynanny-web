import { computeAccruedNis, formatNis, getBillingState, type BillingSessionRow } from "@/lib/billing/session-billing";
import { formatElapsed } from "@/lib/session/protocol";

export type LockedWaitParentEndDisplay = {
  lockedDuration: number;
  timerText: string;
  accruedNis: string;
};

/** DB-only math lock: sitter_end_shake − parent_start_shake. No live clock. */
export function computeLockedWaitParentEndDisplay(
  session: BillingSessionRow
): LockedWaitParentEndDisplay {
  const lockedDuration =
    session.sitter_end_shake && session.parent_start_shake
      ? Math.max(
          0,
          Math.floor(
            (new Date(session.sitter_end_shake).getTime() -
              new Date(session.parent_start_shake).getTime()) /
              1000
          )
        )
      : 0;

  return {
    lockedDuration,
    timerText: formatElapsed(lockedDuration),
    accruedNis: formatNis(computeAccruedNis(session, lockedDuration))
  };
}

export function isLockedWaitParentEndState(session: BillingSessionRow): boolean {
  return getBillingState(session) === "WAITING_PARENT_END";
}
