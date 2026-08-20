import { PUSH_SUBSCRIPTIONS_TABLE, UPSERT_PUSH_SUBSCRIPTION_RPC } from "@/lib/push/constants";
import {
  currentNotificationPermission,
  readBrowserPushCapability,
  type PushPermissionState
} from "@/lib/push/capability";
import { registerAnyNannyServiceWorker } from "@/lib/push/service-worker-register";
import { readPublicVapidKey, vapidPublicKeyToUint8Array } from "@/lib/push/vapid-public";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { readSupabaseErrorMessage } from "@/lib/supabase/postgrest-schema";

export type PushSubscribeResult =
  | { ok: true; permission: PushPermissionState }
  | { ok: false; permission: PushPermissionState; reason: string };

function subscriptionKeys(sub: PushSubscription): { endpoint: string; p256dh: string; auth: string } | null {
  const json = sub.toJSON();
  const endpoint = String(json.endpoint ?? sub.endpoint ?? "").trim();
  const p256dh = String(json.keys?.p256dh ?? "").trim();
  const auth = String(json.keys?.auth ?? "").trim();
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth };
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  const registration = await registerAnyNannyServiceWorker();
  if (!registration) return null;
  try {
    return (await registration.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

async function persistSubscription(sub: PushSubscription): Promise<{ ok: boolean; error?: string }> {
  const keys = subscriptionKeys(sub);
  if (!keys) return { ok: false, error: "incomplete subscription" };
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: "supabase unavailable" };

  const { error } = await supabase.rpc(UPSERT_PUSH_SUBSCRIPTION_RPC, {
    p_endpoint: keys.endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_user_agent: typeof navigator === "undefined" ? null : navigator.userAgent
  });

  if (error) {
    return { ok: false, error: readSupabaseErrorMessage(error) };
  }
  return { ok: true };
}

async function deleteSubscriptionRow(endpoint: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !endpoint) return;
  const { error } = await supabase.from(PUSH_SUBSCRIPTIONS_TABLE).delete().eq("endpoint", endpoint);
  if (error) {
    console.warn("[push] delete subscription:", readSupabaseErrorMessage(error));
  }
}

/**
 * Request OS permission and subscribe. Call only from a user gesture.
 * Never from page load.
 */
export async function enablePushFromUserGesture(): Promise<PushSubscribeResult> {
  const capability = readBrowserPushCapability();
  if (capability.iosRequiresStandalone) {
    return {
      ok: false,
      permission: currentNotificationPermission(),
      reason: "ios-not-standalone"
    };
  }
  if (!capability.canSubscribe) {
    return { ok: false, permission: "unsupported", reason: "unsupported" };
  }

  const publicKey = readPublicVapidKey();
  if (!publicKey) {
    return { ok: false, permission: currentNotificationPermission(), reason: "missing-vapid" };
  }

  const registration = await registerAnyNannyServiceWorker();
  if (!registration) {
    return { ok: false, permission: currentNotificationPermission(), reason: "no-service-worker" };
  }

  let permission = currentNotificationPermission();
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch {
      permission = "denied";
    }
  }
  if (permission !== "granted") {
    return { ok: false, permission, reason: permission === "denied" ? "denied" : "permission" };
  }

  try {
    const existing = await registration.pushManager.getSubscription();
    const sub =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKeyToUint8Array(publicKey) as BufferSource
      }));
    const saved = await persistSubscription(sub);
    if (!saved.ok) {
      return { ok: false, permission, reason: saved.error ?? "save-failed" };
    }
    return { ok: true, permission };
  } catch (err) {
    console.warn("[push] subscribe failed:", err);
    return { ok: false, permission, reason: "subscribe-failed" };
  }
}

export async function unsubscribeCurrentPushSubscription(): Promise<void> {
  const sub = await getExistingPushSubscription();
  const endpoint = sub?.endpoint ?? "";
  try {
    if (sub) await sub.unsubscribe();
  } catch {
    /* already gone */
  }
  if (endpoint) await deleteSubscriptionRow(endpoint);
}

/** If OS permission is already granted and preference is on, (re)save this device. Does not prompt. */
export async function reconcilePushSubscription(pushEnabled: boolean): Promise<void> {
  if (!pushEnabled) return;
  const capability = readBrowserPushCapability();
  if (!capability.canSubscribe) return;
  if (currentNotificationPermission() !== "granted") return;
  if (!readPublicVapidKey()) return;

  const registration = await registerAnyNannyServiceWorker();
  if (!registration) return;
  try {
    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKeyToUint8Array(readPublicVapidKey()) as BufferSource
      });
    }
    await persistSubscription(sub);
  } catch (err) {
    console.warn("[push] reconcile failed:", err);
  }
}
