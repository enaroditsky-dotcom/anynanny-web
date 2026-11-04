/** How many automatic retries follow the first failed check. */
export const AUTH_TRANSIENT_RETRY_LIMIT = 4;

export const AUTH_SERVICE_UNAVAILABLE_MESSAGE = "החיבור לשירות אינו זמין כרגע.";
export const AUTH_RETRY_MESSAGE = "אין חיבור כרגע. נסו שוב.";

/**
 * Delay before the next check. `attempt` is 1-based (the retry about to be scheduled).
 * 1s, 2s, 4s, 8s — bounded so a dead server is not polled in a tight loop.
 */
export function authRetryDelayMs(attempt: number): number {
  const step = Math.min(Math.max(1, Math.floor(attempt)), AUTH_TRANSIENT_RETRY_LIMIT);
  return 1000 * 2 ** (step - 1);
}

export type AuthRetryPlan =
  | { action: "schedule"; delayMs: number; nextAttempt: number }
  | { action: "exhausted" };

/** `completedAttempts` is how many automatic retries have already been scheduled. */
export function planAuthRetry(completedAttempts: number): AuthRetryPlan {
  if (completedAttempts >= AUTH_TRANSIENT_RETRY_LIMIT) return { action: "exhausted" };
  const nextAttempt = completedAttempts + 1;
  return { action: "schedule", delayMs: authRetryDelayMs(nextAttempt), nextAttempt };
}

/**
 * A saved active_role is not a session. Dashboard entry requires a verified user id.
 * Returns null when authentication has not been verified, including a missing client.
 */
export function roleDashboardHref(activeRole: string | null, verifiedUserId: string | null): string | null {
  if (!verifiedUserId) return null;
  if (activeRole === "parent") return "/parent/dashboard";
  if (activeRole === "sitter") return "/sitter/dashboard";
  return null;
}

export type AuthRetryScheduler = {
  noteUnavailable: () => { scheduled: boolean; delayMs?: number; exhausted: boolean };
  noteSettled: () => void;
  retryNow: () => void;
  dispose: () => void;
};

/**
 * Schedules the next auth check after a temporary failure.
 * Does not consult the browser online flag. A server outage can heal while the browser still reports itself online.
 * dispose() drops a pending timer so an unmounted screen cannot retry.
 */
export function createAuthRetryScheduler(deps: {
  setTimer: (delayMs: number, fn: () => void) => number;
  clearTimer: (id: number) => void;
  onRetry: () => void;
  onExhausted: () => void;
}): AuthRetryScheduler {
  let completedAttempts = 0;
  let timer: number | null = null;
  let disposed = false;

  const clear = () => {
    if (timer == null) return;
    deps.clearTimer(timer);
    timer = null;
  };

  return {
    noteUnavailable() {
      if (disposed || timer != null) {
        return { scheduled: false, exhausted: completedAttempts >= AUTH_TRANSIENT_RETRY_LIMIT };
      }
      const plan = planAuthRetry(completedAttempts);
      if (plan.action === "exhausted") {
        deps.onExhausted();
        return { scheduled: false, exhausted: true };
      }
      completedAttempts = plan.nextAttempt;
      timer = deps.setTimer(plan.delayMs, () => {
        timer = null;
        if (disposed) return;
        deps.onRetry();
      });
      return { scheduled: true, delayMs: plan.delayMs, exhausted: false };
    },
    noteSettled() {
      completedAttempts = 0;
      clear();
    },
    retryNow() {
      completedAttempts = 0;
      clear();
    },
    dispose() {
      disposed = true;
      clear();
    }
  };
}
