import type { SupabaseClient } from "@supabase/supabase-js";
import { NOTIFICATIONS_TABLE } from "@/lib/chat/constants";
import type { CanonicalNotificationPayload } from "@/lib/notifications/kinds";
import { loadAppBadgeCount } from "@/lib/push/badge-query";
import { NOTIFICATION_PUSH_DISPATCHES_TABLE, PUSH_SUBSCRIPTIONS_TABLE } from "@/lib/push/constants";
import { buildPrivacySafePushPayload } from "@/lib/push/payload";
import { isProfileRole, PROFILES_TABLE } from "@/lib/supabase/profiles";
import {
  sendWebPush,
  type PushSubscriptionRecord,
  type WebPushSendResult
} from "@/lib/push/web-push-sender";

export type DeliverPushDeps = {
  admin: SupabaseClient;
  send?: (subscription: PushSubscriptionRecord, payloadJson: string) => Promise<WebPushSendResult>;
};

function asPayload(value: unknown): CanonicalNotificationPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as CanonicalNotificationPayload;
}

/** Written only by submit_broadcast_question_response. Clients cannot insert notifications or update this column. */
export const SMART_REPLY_PUSH_DEDUPE_PREFIX = "smart-reply:";

const SMART_REPLY_DEDUPE_KEY = new RegExp(
  `^${SMART_REPLY_PUSH_DEDUPE_PREFIX}([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$`,
  "i"
);

/**
 * True only for the row the answer function stores: dedupe key smart-reply:<question uuid>
 * and the same question id inside the server payload. A client-supplied boolean is not enough.
 */
export function isServerSmartReplyNotification(
  row: { dedupe_key?: unknown; payload?: unknown } | null | undefined
): boolean {
  const key = typeof row?.dedupe_key === "string" ? row.dedupe_key.trim() : "";
  const match = SMART_REPLY_DEDUPE_KEY.exec(key);
  if (!match) return false;
  const payload = asPayload(row?.payload);
  const sourceQuestionId = String(payload.source_question_id ?? "").trim().toLowerCase();
  return payload.smart_reply === true && sourceQuestionId === match[1].toLowerCase();
}

export async function claimNotificationPushDispatch(
  admin: SupabaseClient,
  notificationId: string
): Promise<boolean> {
  const { error } = await admin.from(NOTIFICATION_PUSH_DISPATCHES_TABLE).insert({
    notification_id: notificationId
  });
  if (!error) return true;
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const message = error.message ?? "";
  if (code === "23505" || /duplicate|unique/i.test(message)) return false;
  throw new Error(message || "failed to claim push dispatch");
}

export async function sendPushToSubscriptions(
  subscriptions: PushSubscriptionRecord[],
  payloadJson: string,
  send: (subscription: PushSubscriptionRecord, payloadJson: string) => Promise<WebPushSendResult>,
  onExpired: (subscription: PushSubscriptionRecord) => Promise<void>
): Promise<{ sent: number; removed: number }> {
  let sent = 0;
  let removed = 0;
  const results = await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      const result = await send(subscription, payloadJson);
      if (result.ok) {
        sent += 1;
        return;
      }
      if (result.expired) {
        await onExpired(subscription);
        removed += 1;
      }
    })
  );
  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("[push] device send failed:", result.reason);
    }
  }
  return { sent, removed };
}

export async function deliverCanonicalNotificationPush(
  notificationId: string,
  deps: DeliverPushDeps
): Promise<{ skipped: boolean; sent: number; removed: number; reason?: string }> {
  const id = notificationId.trim();
  if (!id) return { skipped: true, sent: 0, removed: 0, reason: "missing id" };

  const { data: notification, error: notificationError } = await deps.admin
    .from(NOTIFICATIONS_TABLE)
    .select("id, user_id, kind, payload, dedupe_key")
    .eq("id", id)
    .maybeSingle();

  if (notificationError) throw new Error(notificationError.message);
  if (!notification?.user_id) {
    return { skipped: true, sent: 0, removed: 0, reason: "missing notification" };
  }

  // The notifications INSERT webhook still calls this route. Smart Replies stop
  // here, before a dispatch row or a device send. Other kinds keep the claim below.
  if (isServerSmartReplyNotification(notification)) {
    return { skipped: true, sent: 0, removed: 0, reason: "smart_reply" };
  }

  const claimed = await claimNotificationPushDispatch(deps.admin, id);
  if (!claimed) {
    return { skipped: true, sent: 0, removed: 0, reason: "duplicate" };
  }
  // Regular Broadcasts and Broadcast questions share this path.
  // An existing notification_push_dispatches row, including historical
  // admin_broadcast claims, returns above and is not sent again.

  const userId = String(notification.user_id);
  const { data: profile, error: profileError } = await deps.admin
    .from(PROFILES_TABLE)
    .select("role, push_enabled")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (profile && profile.push_enabled === false) {
    return { skipped: true, sent: 0, removed: 0, reason: "push_enabled=false" };
  }

  const kind = String(notification.kind ?? "");
  const role = isProfileRole(profile?.role) ? profile.role : "parent";
  const { data: subscriptions, error: subError } = await deps.admin
    .from(PUSH_SUBSCRIPTIONS_TABLE)
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (subError) throw new Error(subError.message);
  const rows = (Array.isArray(subscriptions) ? subscriptions : []) as PushSubscriptionRecord[];
  if (rows.length === 0) {
    return { skipped: true, sent: 0, removed: 0, reason: "no subscriptions" };
  }

  const badge = await loadAppBadgeCount(deps.admin, userId);
  const payload = buildPrivacySafePushPayload({
    notificationId: String(notification.id),
    kind,
    role,
    payload: asPayload(notification.payload),
    badge
  });
  const payloadJson = JSON.stringify(payload);
  const send = deps.send ?? sendWebPush;
  const { sent, removed } = await sendPushToSubscriptions(rows, payloadJson, send, async (subscription) => {
    await deps.admin
      .from(PUSH_SUBSCRIPTIONS_TABLE)
      .delete()
      .eq("id", subscription.id)
      .eq("user_id", userId);
  });

  if (sent === 0 && rows.length > 0) {
    await deps.admin.from(NOTIFICATION_PUSH_DISPATCHES_TABLE).delete().eq("notification_id", id);
  }

  return { skipped: false, sent, removed };
}
