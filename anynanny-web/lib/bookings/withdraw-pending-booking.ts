import type { SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseErrorMessage } from "@/lib/supabase/postgrest-schema";

export const WITHDRAW_PENDING_BOOKING_RPC = "withdraw_pending_booking" as const;

export const PENDING_WITHDRAW_COPY = {
  action: "בטל בקשה",
  busy: "מבטלים…",
  confirm: "לבטל את הבקשה לבייביסיטרית?",
  alreadyHandled: "הבקשה כבר טופלה",
  genericError: "הפעולה נכשלה. נסו שוב.",
  reminderTitle: "בקשה ממתינה",
  reminderBody: "הבייביסיטר עדיין לא הגיבה לבקשתך.\nלסגור את הפנייה לבייביסיטרית?",
  reminderYes: "כן",
  reminderNo: "לא",
  reminderYesBusy: "סוגרים…",
  reminderNoBusy: "מעדכנים…"
} as const;

export type WithdrawPendingRpcState = "cancelled" | "already_cancelled";

export type WithdrawPendingResult =
  | { ok: true; state: WithdrawPendingRpcState }
  | { ok: false; error: string };

export function mapWithdrawPendingError(message: string): string {
  const m = message.toLowerCase();
  if (
    m.includes("42501") ||
    m.includes("not authorized") ||
    m.includes("not authenticated")
  ) {
    return "אין הרשאה לבצע פעולה זו.";
  }
  if (
    m.includes("booking is not pending") ||
    m.includes("already processed") ||
    m.includes("no longer pending")
  ) {
    return PENDING_WITHDRAW_COPY.alreadyHandled;
  }
  if (m.includes("booking not found") || m.includes("missing booking")) {
    return "המשמרת לא נמצאה.";
  }
  if (m.includes("could not find the function") || m.includes("pgrst202")) {
    return "עדכון הביטול עדיין לא זמין. נסו שוב לאחר רענון.";
  }
  return message.trim() || PENDING_WITHDRAW_COPY.genericError;
}

function parseRpcPayload(data: unknown): WithdrawPendingResult {
  if (!data || typeof data !== "object") {
    return { ok: false, error: PENDING_WITHDRAW_COPY.genericError };
  }
  const payload = data as { ok?: unknown; state?: unknown };
  if (payload.ok === true) {
    if (payload.state === "already_cancelled" || payload.state === "cancelled") {
      return { ok: true, state: payload.state };
    }
    return { ok: true, state: "cancelled" };
  }
  return { ok: false, error: PENDING_WITHDRAW_COPY.genericError };
}

export async function withdrawPendingBooking(
  supabase: SupabaseClient,
  bookingId: string
): Promise<WithdrawPendingResult> {
  const id = bookingId.trim();
  if (!id) return { ok: false, error: "המשמרת לא נמצאה." };

  const { data, error } = await supabase.rpc(WITHDRAW_PENDING_BOOKING_RPC, {
    p_booking_id: id
  });

  if (error) {
    return { ok: false, error: mapWithdrawPendingError(readSupabaseErrorMessage(error)) };
  }

  return parseRpcPayload(data);
}
