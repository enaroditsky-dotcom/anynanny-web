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

  const claimed = await claimNotificationPushDispatch(deps.admin, id);
  if (!claimed) {
    return { skipped: true, sent: 0, removed: 0, reason: "duplicate" };
  }

  const { data: notification, error: notificationError } = await deps.admin
    .from(NOTIFICATIONS_TABLE)
    .select("id, user_id, kind, payload")
    .eq("id", id)
    .maybeSingle();

  if (notificationError) throw new Error(notificationError.message);
  if (!notification?.user_id) {
    return { skipped: true, sent: 0, removed: 0, reason: "missing notification" };
  }

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
  if (kind === "admin_broadcast") {
    return { skipped: true, sent: 0, removed: 0, reason: "in-app only" };
  }

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
    kind: String(notification.kind ?? ""),
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
