import { NOTIFICATIONS_TABLE } from "@/lib/chat/constants";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CreateNotificationInput = {
  userId: string;
  kind: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
};

/**
 * Best-effort in-app notification insert (service-role or elevated client).
 * Never throws — payment finalize must not fail because of notification I/O.
 */
export async function createInAppNotification(
  supabase: SupabaseClient,
  input: CreateNotificationInput
): Promise<{ id: string | null; error: string | null }> {
  const userId = input.userId.trim();
  if (!userId) return { id: null, error: "Missing user id." };

  const { data, error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .insert({
      user_id: userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      payload: input.payload ?? {}
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn("[createInAppNotification]", error.message, { kind: input.kind, userId });
    return { id: null, error: error.message };
  }

  return { id: data?.id ? String(data.id) : null, error: null };
}

export async function notifySitterPaymentReceived(
  supabase: SupabaseClient,
  input: {
    sitterId: string;
    bookingId: string;
    amountPaid?: string | null;
    hypApprovalId?: string | null;
    sessionIds?: string[];
  }
): Promise<void> {
  const amountLabel =
    input.amountPaid && Number.isFinite(Number(input.amountPaid))
      ? `₪${Number(input.amountPaid).toFixed(2)}`
      : null;

  await createInAppNotification(supabase, {
    userId: input.sitterId,
    kind: "payment_received",
    title: "תשלום התקבל",
    body: amountLabel
      ? `התקבל תשלום מאובטח דרך HYP בסך ${amountLabel}. הפרטים עודכנו ב«הכנסות ותשלומים».`
      : "התקבל תשלום מאובטח דרך HYP. הפרטים עודכנו ב«הכנסות ותשלומים».",
    payload: {
      booking_id: input.bookingId,
      hyp_approval_id: input.hypApprovalId ?? null,
      session_ids: input.sessionIds ?? [],
      amount: input.amountPaid ?? null,
      gateway: "hyp"
    }
  });
}
