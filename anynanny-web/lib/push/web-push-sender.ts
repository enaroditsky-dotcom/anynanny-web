import type { WebPushError } from "web-push";
import webpush from "web-push";
import { sanitizeVapidPublicKeyInput } from "@/lib/push/vapid-public";

export type PushSubscriptionRecord = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type WebPushSendResult =
  | { ok: true }
  | { ok: false; expired: boolean; status?: number };

let vapidConfigured = false;

function readServerVapid(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = sanitizeVapidPublicKeyInput(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const privateKey = sanitizeVapidPublicKeyInput(process.env.VAPID_PRIVATE_KEY);
  const subject = String(process.env.VAPID_SUBJECT ?? "").trim().replace(/^['"]|['"]$/g, "");
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export function isWebPushConfigured(): boolean {
  return readServerVapid() !== null;
}

function ensureVapid(): boolean {
  const keys = readServerVapid();
  if (!keys) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
    vapidConfigured = true;
  }
  return true;
}

export function isExpiredPushStatus(status: number | undefined): boolean {
  return status === 404 || status === 410;
}

function statusFromError(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const record = err as Partial<WebPushError> & { statusCode?: number; status?: number };
  if (typeof record.statusCode === "number") return record.statusCode;
  if (typeof record.status === "number") return record.status;
  return undefined;
}

export async function sendWebPush(
  subscription: PushSubscriptionRecord,
  payloadJson: string
): Promise<WebPushSendResult> {
  if (!ensureVapid()) {
    return { ok: false, expired: false };
  }
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth
        }
      },
      payloadJson,
      { TTL: 60 * 60 * 24, urgency: "normal" }
    );
    return { ok: true };
  } catch (err) {
    const status = statusFromError(err);
    return { ok: false, expired: isExpiredPushStatus(status), status };
  }
}
