export const CHAT_ROOMS_TABLE = "chat_rooms" as const;
export const CHAT_MESSAGES_TABLE = "chat_messages" as const;
export const SHIFT_REQUESTS_TABLE = "shift_requests" as const;
export const NOTIFICATIONS_TABLE = "notifications" as const;

export type ShiftRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export type ChatMessageRow = {
  id: string;
  room_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type ChatRoomRow = {
  id: string;
  parent_id: string;
  sitter_id: string;
  created_at: string;
  updated_at: string;
};
