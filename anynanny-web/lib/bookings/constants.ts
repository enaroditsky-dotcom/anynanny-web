export const BOOKINGS_TABLE = "bookings" as const;

export type BookingStatus = "pending" | "approved" | "rejected" | "cancelled" | "sitter_started";

export type BookingRow = {
  id: string;
  parent_id: string;
  sitter_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  actual_start_time?: string | null;
  created_at: string;
  updated_at: string;
};
