import "server-only";
import { createInAppNotification } from "@/lib/notifications/create-notification";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import type { BroadcastAudienceType } from "@/lib/admin/broadcast-audience";
import type { ValidatedBroadcastMessage } from "@/lib/admin/broadcast-validation";

export const ADMIN_COUNT_BROADCAST_RECIPIENTS_RPC = "admin_count_broadcast_recipients";
export const ADMIN_SEND_IN_APP_BROADCAST_RPC = "admin_send_in_app_broadcast";

export type BroadcastCountResult = {
  audience: BroadcastAudienceType;
  recipientCount: number;
};

export type BroadcastSendResult = {
  broadcastId: string;
  recipientCount: number;
  alreadySent: boolean;
};

type CountRpcRow = { recipient_count?: number | null } | number | null;

function asCount(data: unknown): number {
  if (typeof data === "string") {
    try {
      return asCount(JSON.parse(data) as unknown);
    } catch {
      const n = Number(data);
      if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
      return 0;
    }
  }
  if (typeof data === "number" && Number.isFinite(data)) return Math.max(0, Math.floor(data));
  if (data && typeof data === "object" && "recipient_count" in data) {
    const n = Number((data as { recipient_count?: unknown }).recipient_count);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return 0;
}

export async function countBroadcastRecipients(
  audience: BroadcastAudienceType
): Promise<BroadcastCountResult> {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc(ADMIN_COUNT_BROADCAST_RECIPIENTS_RPC, {
    p_audience: audience
  });
  if (error) {
    throw new Error(error.message || "Failed to count broadcast recipients.");
  }
  return { audience, recipientCount: asCount(data as CountRpcRow) };
}

function payloadFor(message: ValidatedBroadcastMessage, broadcastId: string | null, isTest: boolean) {
  return {
    broadcast_id: broadcastId,
    cta_route: message.ctaRoute,
    cta_label: message.ctaLabel,
    is_test: isTest
  };
}

export async function sendBroadcastTestToUser(
  userId: string,
  message: ValidatedBroadcastMessage
): Promise<{ notificationId: string | null }> {
  const uid = userId.trim();
  if (!uid) throw new Error("Missing user id.");
  const supabase = getSupabaseServiceRoleClient();
  const testKey = `test:${message.idempotencyKey || crypto.randomUUID()}`;
  const result = await createInAppNotification(supabase, {
    userId: uid,
    kind: "admin_broadcast",
    title: message.title,
    body: message.body,
    payload: payloadFor(message, null, true),
    dedupeKey: testKey
  });
  if (result.error) {
    throw new Error(result.error);
  }
  return { notificationId: result.id };
}

export async function sendAdminBroadcast(
  message: ValidatedBroadcastMessage
): Promise<BroadcastSendResult> {
  if (!message.idempotencyKey) {
    throw new Error("Missing idempotency key.");
  }
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc(ADMIN_SEND_IN_APP_BROADCAST_RPC, {
    p_audience: message.audience,
    p_title: message.title,
    p_body: message.body,
    p_cta_label: message.ctaLabel,
    p_cta_route: message.ctaRoute,
    p_idempotency_key: message.idempotencyKey
  });
  if (error) {
    throw new Error(error.message || "Failed to send broadcast.");
  }
  const row = (data ?? {}) as {
    broadcast_id?: string;
    recipient_count?: number;
    already_sent?: boolean;
  };
  const broadcastId = String(row.broadcast_id ?? "").trim();
  if (!broadcastId) {
    throw new Error("Broadcast did not return an id.");
  }
  return {
    broadcastId,
    recipientCount: asCount(row.recipient_count),
    alreadySent: Boolean(row.already_sent)
  };
}
