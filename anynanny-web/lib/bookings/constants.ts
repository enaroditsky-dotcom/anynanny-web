export const BOOKINGS_TABLE = "bookings" as const;

export type BookingStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "sitter_started"
  | "parent_started"
  | "sitter_ended"
  | "completed";

export const SITTER_FORCE_END_ADMIN_NOTE =
  "Sitter utilized force-end override due to unresponsive parent." as const;

export const SITTER_FORCE_END_SUCCESS_MESSAGE =
  "המשמרת נסגרה ודווחה לבדיקה. האפליקציה שוחררה" as const;

export type BookingPaymentStatus =
  | "unpaid"
  | "pending_checkout"
  | "paid";

export type BookingRow = {
  id: string;
  parent_id: string;
  sitter_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;

  /** Snapshot of sitter rate at booking time — canonical for live + settlement. */
  hourly_rate_nis?: number | null;

  actual_start_time?: string | null;
  actual_end_time?: string | null;

  requires_admin_review?: boolean;
  admin_notes?: string | null;

  payment_status?: BookingPaymentStatus;
  paid_at?: string | null;
  hyp_trans_id?: string | null;
  charged_amount_nis?: number | null;
  stripe_checkout_session_id?: string | null;

  parent_notified_at?: string | null;

  // הודעת דחייה אוטומטית מהנני
  rejection_note?: string | null;

  /** Original cancellation requester (auth user id). Role is stored separately. */
  cancellation_requested_by?: string | null;
  cancellation_requested_role?: "parent" | "sitter" | null;
  cancellation_requested_at?: string | null;
  cancellation_message?: string | null;
  cancellation_approved_by?: string | null;
  cancellation_approved_at?: string | null;
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  cancellation_acknowledged_at?: string | null;

  created_at: string;
  updated_at: string;
};