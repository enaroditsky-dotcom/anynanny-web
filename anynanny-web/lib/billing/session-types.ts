/** Billing-phase `public.sessions` row (Double-Shake schema). */

export const SESSIONS_TABLE = "sessions";
export const DEFAULT_HOURLY_RATE = 50;

export const BILLING_SESSION_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  COMPLETED: "completed",
  DISPUTED: "disputed"
} as const;

export type BillingSessionStatus =
  (typeof BILLING_SESSION_STATUS)[keyof typeof BILLING_SESSION_STATUS];

export type BillingSessionRow = {
  id: string;
  created_at?: string;
  updated_at?: string;
  parent_id: string;
  sitter_id: string;
  hourly_rate: number;
  start_time_requested: string | null;
  start_time_confirmed_by_sitter: string | null;
  end_time_requested: string | null;
  end_time_confirmed_by_parent: string | null;
  status: BillingSessionStatus | string;
  total_minutes: number | null;
  total_amount: number | null;
};

export const BILLING_PENDING_STATUSES: readonly string[] = [
  BILLING_SESSION_STATUS.PENDING,
  "pending_sitter_approval"
];
