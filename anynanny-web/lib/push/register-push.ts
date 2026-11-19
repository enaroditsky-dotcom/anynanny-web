import { PUSH_SUBSCRIPTIONS_TABLE, UPSERT_PUSH_SUBSCRIPTION_RPC } from "@/lib/push/constants";
import {
  currentNotificationPermission,
  readBrowserPushCapability,
  type PushPermissionState
} from "@/lib/push/capability";
import { registerAnyNannyServiceWorker } from "@/lib/push/service-worker-register";
import { readPublicVapidKey, readApplicationServerKey, InvalidVapidPublicKeyError } from "@/lib/push/vapid-public";
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

const DEVICE_PUSH_ENDPOINT_KEY = "anynanny_push_endpoint_v1";

export type PushReleaseResult =
  | { ok: true; removed: boolean }
  | { ok: false; reason: "server" | "browser"; endpoint: string };

function rememberPushEndpoint(endpoint: string): void {
  if (typeof window === "undefined" || !endpoint) return;
  try {
    localStorage.setItem(DEVICE_PUSH_ENDPOINT_KEY, endpoint);
  } catch {
    /* ignore quota */
  }
}

function readRememberedPushEndpoint(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(DEVICE_PUSH_ENDPOINT_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

function clearRememberedPushEndpoint(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(DEVICE_PUSH_ENDPOINT_KEY);
  } catch {
    /* ignore */
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
  rememberPushEndpoint(keys.endpoint);
  return { ok: true };
}

/** Browser unsubscribe does not prove the server row is gone. */
async function deleteOwnPushEndpoint(endpoint: string): Promise<{ ok: boolean }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !endpoint) return { ok: false };
  const removed = await supabase.from(PUSH_SUBSCRIPTIONS_TABLE).delete().eq("endpoint", endpoint);
  if (removed.error) {
    console.warn("[push] delete subscription:", readSupabaseErrorMessage(removed.error));
    return { ok: false };
  }
  const stillThere = await supabase
    .from(PUSH_SUBSCRIPTIONS_TABLE)
    .select("id")
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (stillThere.error) {
    console.warn("[push] confirm subscription delete:", readSupabaseErrorMessage(stillThere.error));
    return { ok: false };
  }
  if (stillThere.data) return { ok: false };
  return { ok: true };
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

  let applicationServerKey: BufferSource;
  try {
    applicationServerKey = readApplicationServerKey() as BufferSource;
  } catch (err) {
    if (err instanceof InvalidVapidPublicKeyError) {
      console.warn("[push] subscribe failed:", err.message);
      return { ok: false, permission: currentNotificationPermission(), reason: "invalid-vapid" };
    }
    throw err;
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
        applicationServerKey
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

/**
 * Remove this device from the signed-in account.
 * A live subscription is claimed first, so a previous account's row can be
 * moved with the existing upsert and then deleted. Browser unsubscribe is
 * not treated as server cleanup.
 */
export async function unsubscribeCurrentPushSubscription(): Promise<PushReleaseResult> {
  const sub = await getExistingPushSubscription();
  if (sub?.endpoint) {
    const claimed = await persistSubscription(sub);
    if (!claimed.ok) return { ok: false, reason: "server", endpoint: sub.endpoint };
  }

  let browserFailed = false;
  if (sub) {
    try {
      await sub.unsubscribe();
    } catch {
      browserFailed = true;
    }
  }

  const endpoint = (sub?.endpoint || readRememberedPushEndpoint()).trim();
  if (!endpoint) return { ok: true, removed: false };

  const deleted = await deleteOwnPushEndpoint(endpoint);
  if (!deleted.ok) return { ok: false, reason: "server", endpoint };
  if (browserFailed) return { ok: false, reason: "browser", endpoint };
  clearRememberedPushEndpoint();
  return { ok: true, removed: true };
}

/**
 * The signed-in user must own this device before any preference check.
 * push_enabled false still claims and then removes a subscription left by
 * the previous account. It does not leave that row in place.
 */
export async function alignDevicePushOwnership(pushEnabled: boolean): Promise<PushReleaseResult> {
  const sub = await getExistingPushSubscription();
  if (sub) {
    const claimed = await persistSubscription(sub);
    if (!claimed.ok) return { ok: false, reason: "server", endpoint: sub.endpoint };
    if (!pushEnabled) return unsubscribeCurrentPushSubscription();
    return { ok: true, removed: false };
  }
  if (pushEnabled) await reconcilePushSubscription(true);
  return { ok: true, removed: false };
}

/** If OS permission is already granted and preference is on, (re)save this device. Does not prompt. */
export async function reconcilePushSubscription(pushEnabled: boolean): Promise<void> {
  if (!pushEnabled) return;
  const capability = readBrowserPushCapability();
  if (!capability.canSubscribe) return;
  if (currentNotificationPermission() !== "granted") return;
  if (!readPublicVapidKey()) {
    console.warn("[push] reconcile failed: NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing");
    return;
  }

  const registration = await registerAnyNannyServiceWorker();
  if (!registration) return;
  try {
    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      const applicationServerKey = readApplicationServerKey() as BufferSource;
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });
    }
    await persistSubscription(sub);
  } catch (err) {
    const message =
      err instanceof InvalidVapidPublicKeyError
        ? err.message
        : err instanceof Error
          ? err.message
          : "subscribe failed";
    console.warn("[push] reconcile failed:", message);
  }
}
