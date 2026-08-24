"use client";

/**
 * Intentionally inert.
 *
 * This used to call parent/sitter-wide DELETE via resetStuckShiftsFor*.
 * Production stuck-shift recovery lives on the Parent and Sitter dashboards
 * (displayed booking/session → requires_admin_review). This component cannot
 * identify a single displayed booking+session, so it must not reset broadly
 * and must not render a user-facing action.
 *
 * Keep this file on disk. Do not wire it back into production UI.
 */
type Props = {
  className?: string;
  variant?: "button" | "link";
  role?: "parent" | "sitter";
  onSuccess?: () => void | Promise<void>;
};

export function StuckShiftDevResetButton(_props: Props) {
  return null;
}
