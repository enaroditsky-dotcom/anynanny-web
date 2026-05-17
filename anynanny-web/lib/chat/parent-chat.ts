import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAT_MESSAGES_TABLE, CHAT_ROOMS_TABLE, type ChatMessageRow, type ChatRoomRow } from "@/lib/chat/constants";

function chatRpcErrorMessage(error: { message?: string; code?: string } | null): string {
  if (!error?.message) return "שגיאה בשיחה";
  const m = error.message.toLowerCase();
  if (m.includes("not_authenticated")) return "יש להתחבר מחדש";
  if (m.includes("parent_only")) return "פעולה זמינה להורים בלבד";
  if (m.includes("sitter_not_found")) return "לא נמצא פרופיל בייביסיטר";
  if (m.includes("invalid_sitter")) return "מזהה בייביסיטר לא תקין";
  return error.message;
}

/** Returns existing room id or creates one for the signed-in parent. */
export async function getOrCreateChatRoom(
  supabase: SupabaseClient,
  sitterId: string
): Promise<{ roomId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("get_or_create_chat_room", {
    p_sitter_id: sitterId
  });

  if (error) {
    return { roomId: null, error: chatRpcErrorMessage(error) };
  }

  const roomId = typeof data === "string" ? data : data != null ? String(data) : null;
  if (!roomId) {
    return { roomId: null, error: "לא ניתן לפתוח שיחה" };
  }

  return { roomId, error: null };
}

export async function fetchChatRoom(
  supabase: SupabaseClient,
  roomId: string
): Promise<{ room: ChatRoomRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from(CHAT_ROOMS_TABLE)
    .select("id, parent_id, sitter_id, created_at, updated_at")
    .eq("id", roomId)
    .maybeSingle();

  if (error) {
    return { room: null, error: error.message };
  }

  return { room: (data as ChatRoomRow | null) ?? null, error: null };
}

export async function fetchChatMessages(
  supabase: SupabaseClient,
  roomId: string,
  limit = 80
): Promise<{ messages: ChatMessageRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from(CHAT_MESSAGES_TABLE)
    .select("id, room_id, sender_id, body, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return { messages: [], error: error.message };
  }

  return { messages: (data as ChatMessageRow[]) ?? [], error: null };
}

export async function sendChatMessage(
  supabase: SupabaseClient,
  roomId: string,
  senderId: string,
  body: string
): Promise<{ message: ChatMessageRow | null; error: string | null }> {
  const trimmed = body.trim();
  if (!trimmed) {
    return { message: null, error: "הודעה ריקה" };
  }

  const { data, error } = await supabase
    .from(CHAT_MESSAGES_TABLE)
    .insert({ room_id: roomId, sender_id: senderId, body: trimmed })
    .select("id, room_id, sender_id, body, created_at")
    .single();

  if (error) {
    return { message: null, error: error.message };
  }

  await supabase.from(CHAT_ROOMS_TABLE).update({ updated_at: new Date().toISOString() }).eq("id", roomId);

  return { message: data as ChatMessageRow, error: null };
}
