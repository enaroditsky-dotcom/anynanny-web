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

export type BookingPaymentStatus = "unpaid" | "pending_checkout" | "paid";

export type BookingRow = {
  id: string;
  parent_id: string;
  sitter_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  actual_start_time?: string | null;
  actual_end_time?: string | null;
  requires_admin_review?: boolean;
  admin_notes?: string | null;
  payment_status?: BookingPaymentStatus;
  paid_at?: string | null;
  stripe_checkout_session_id?: string | null;
  parent_notified_at?: string | null;
  created_at: string;
  updated_at: string;
};
