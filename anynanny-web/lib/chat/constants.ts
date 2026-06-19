export const MESSAGES_TABLE = "messages" as const;
export const SHIFT_REQUESTS_TABLE = "shift_requests" as const;
export const NOTIFICATIONS_TABLE = "notifications" as const;

export type ShiftRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export type MessageRow = {
  id: string;
  booking_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};
