import type { SupabaseClient } from "@supabase/supabase-js";
import { NOTIFICATIONS_TABLE } from "@/lib/chat/constants";
import { markNotificationsReadBestEffort } from "@/lib/notifications/read-state";
import { readSupabaseErrorMessage } from "@/lib/supabase/postgrest-schema";

export const PENDING_NO_RESPONSE_REMINDER_KIND = "pending_no_response_reminder" as const;

export type PendingNoResponseReminder = {
  id: string;
  bookingId: string;
};

function bookingIdFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  return String((payload as { booking_id?: unknown }).booking_id ?? "").trim();
}

export async function fetchUnreadPendingNoResponseReminder(
  supabase: SupabaseClient,
  parentId: string
): Promise<{ reminder: PendingNoResponseReminder | null; error: string | null }> {
  const uid = parentId.trim();
  if (!uid) return { reminder: null, error: null };

  const { data, error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .select("id, payload, created_at")
    .eq("user_id", uid)
    .eq("kind", PENDING_NO_RESPONSE_REMINDER_KIND)
    .is("read_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { reminder: null, error: readSupabaseErrorMessage(error) };
  }
  if (!data?.id) return { reminder: null, error: null };

  const bookingId = bookingIdFromPayload((data as { payload?: unknown }).payload);
  if (!bookingId) return { reminder: null, error: null };

  return {
    reminder: { id: String(data.id), bookingId },
    error: null
  };
}

export async function markPendingNoResponseReminderRead(
  supabase: SupabaseClient,
  parentId: string,
  reminder: Pick<PendingNoResponseReminder, "id" | "bookingId">
): Promise<void> {
  await markNotificationsReadBestEffort(supabase, parentId, {
    ids: [reminder.id],
    kind: PENDING_NO_RESPONSE_REMINDER_KIND,
    bookingId: reminder.bookingId
  });
}
