import { NOTIFICATIONS_TABLE } from "@/lib/chat/constants";
import {
  notificationDedupeKey,
  type CanonicalNotificationKind
} from "@/lib/notifications/kinds";
import { isDuplicateNotificationError } from "@/lib/notifications/read-state";
import { isPostgrestMissingColumnError, readSupabaseErrorMessage } from "@/lib/supabase/postgrest-schema";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CreateNotificationInput = {
  userId: string;
  kind: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  dedupeKey?: string | null;
};

/**
 * Best-effort in-app notification insert (service-role or elevated client).
 * Never throws — payment finalize must not fail because of notification I/O.
 * Duplicate (user_id, kind, dedupe_key) is treated as success.
 */
export async function createInAppNotification(
  supabase: SupabaseClient,
  input: CreateNotificationInput
): Promise<{ id: string | null; error: string | null }> {
  const userId = input.userId.trim();
  if (!userId) return { id: null, error: "Missing user id." };

  const dedupeKey = input.dedupeKey?.trim() || null;
  const baseRow = {
    user_id: userId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    payload: input.payload ?? {}
  };

  const withDedupe = dedupeKey ? { ...baseRow, dedupe_key: dedupeKey } : baseRow;
  const first = await supabase.from(NOTIFICATIONS_TABLE).insert(withDedupe).select("id").maybeSingle();

  if (!first.error) {
    return { id: first.data?.id ? String(first.data.id) : null, error: null };
  }

  const message = readSupabaseErrorMessage(first.error);
  const code = typeof first.error === "object" && first.error && "code" in first.error
    ? String((first.error as { code?: string }).code ?? "")
    : "";

  if (isDuplicateNotificationError(message, code)) {
    return { id: null, error: null };
  }

  if (dedupeKey && isPostgrestMissingColumnError(message, "dedupe_key")) {
    const retry = await supabase.from(NOTIFICATIONS_TABLE).insert(baseRow).select("id").maybeSingle();
    if (!retry.error) {
      return { id: retry.data?.id ? String(retry.data.id) : null, error: null };
    }
    const retryMessage = readSupabaseErrorMessage(retry.error);
    console.warn("[createInAppNotification]", retryMessage, { kind: input.kind, userId });
    return { id: null, error: retryMessage };
  }

  console.warn("[createInAppNotification]", message, { kind: input.kind, userId });
  return { id: null, error: message };
}

export async function notifySitterManualPaymentReported(
  supabase: SupabaseClient,
  input: {
    sitterId: string;
    bookingId: string;
    paymentMethod?: string | null;
  }
): Promise<void> {
  const kind: CanonicalNotificationKind = "manual_payment_reported";
  await createInAppNotification(supabase, {
    userId: input.sitterId,
    kind,
    title: "ההורה דיווח שהתשלום בוצע",
    body: "יש לאשר האם התשלום התקבל.",
    payload: {
      booking_id: input.bookingId,
      sitter_id: input.sitterId,
      status: "awaiting_sitter_confirmation",
      gateway: "manual",
      amount: null
    },
    dedupeKey: notificationDedupeKey(kind, {
      bookingId: input.bookingId
    })
  });
}

export async function notifySitterManualPaymentResolvedReported(
  supabase: SupabaseClient,
  input: {
    sitterId: string;
    bookingId: string;
    paymentMethod?: string | null;
    resolvedAt?: string | null;
  }
): Promise<void> {
  const kind: CanonicalNotificationKind = "manual_payment_resolved_reported";
  await createInAppNotification(supabase, {
    userId: input.sitterId,
    kind,
    title: "ההורה דיווח שהתשלום הוסדר",
    body: "יש לאשר האם התשלום התקבל.",
    payload: {
      booking_id: input.bookingId,
      sitter_id: input.sitterId,
      status: "awaiting_sitter_confirmation",
      gateway: "manual",
      amount: null
    },
    dedupeKey: notificationDedupeKey(kind, {
      bookingId: input.bookingId,
      resolvedAt: input.resolvedAt
    })
  });
}

export async function notifyParentManualPaymentConfirmed(
  supabase: SupabaseClient,
  input: {
    parentId: string;
    bookingId: string;
  }
): Promise<void> {
  const kind: CanonicalNotificationKind = "manual_payment_confirmed";
  await createInAppNotification(supabase, {
    userId: input.parentId,
    kind,
    title: "קבלת התשלום אושרה",
    body: "הנני אישרה שהתשלום התקבל.",
    payload: {
      booking_id: input.bookingId,
      parent_id: input.parentId,
      status: "awaiting_sitter_rating",
      gateway: "manual"
    },
    dedupeKey: notificationDedupeKey(kind, {
      bookingId: input.bookingId
    })
  });
}

export async function notifyParentManualPaymentDenied(
  supabase: SupabaseClient,
  input: {
    parentId: string;
    bookingId: string;
  }
): Promise<void> {
  const kind: CanonicalNotificationKind = "manual_payment_denied";
  await createInAppNotification(supabase, {
    userId: input.parentId,
    kind,
    title: "התשלום לא אושר",
    body: "הנני דיווחה שהתשלום טרם התקבל. יש להסדיר את התשלום לפני הזמנה חדשה.",
    payload: {
      booking_id: input.bookingId,
      parent_id: input.parentId,
      status: "payment_dispute",
      gateway: "manual"
    },
    dedupeKey: notificationDedupeKey(kind, {
      bookingId: input.bookingId
    })
  });
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

  const kind: CanonicalNotificationKind = "payment_received";
  await createInAppNotification(supabase, {
    userId: input.sitterId,
    kind,
    title: "תשלום התקבל",
    body: amountLabel
      ? `התקבל תשלום מאובטח דרך HYP בסך ${amountLabel}. הפרטים עודכנו ב«הארנק שלי».`
      : "התקבל תשלום מאובטח דרך HYP. הפרטים עודכנו ב«הארנק שלי».",
    payload: {
      booking_id: input.bookingId,
      hyp_approval_id: input.hypApprovalId ?? null,
      session_ids: input.sessionIds ?? [],
      amount: input.amountPaid ?? null,
      gateway: "hyp"
    },
    dedupeKey: notificationDedupeKey(kind, {
      bookingId: input.bookingId,
      hypApprovalId: input.hypApprovalId
    })
  });
}
