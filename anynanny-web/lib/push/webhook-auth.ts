import { timingSafeEqual } from "node:crypto";

export const PUSH_WEBHOOK_HEADER = "x-anynanny-push-secret";

export function readPushWebhookSecret(): string {
  return String(process.env.PUSH_WEBHOOK_SECRET ?? "").trim();
}

function normalizeBearer(value: string): string {
  const trimmed = value.trim();
  if (/^bearer\s+/i.test(trimmed)) return trimmed.replace(/^bearer\s+/i, "").trim();
  return trimmed;
}

export function providedPushWebhookSecret(request: {
  headers: { get(name: string): string | null };
}): string {
  const header = request.headers.get(PUSH_WEBHOOK_HEADER) ?? "";
  if (header.trim()) return header.trim();
  return normalizeBearer(request.headers.get("authorization") ?? "");
}

export function pushWebhookSecretsEqual(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function authorizePushWebhook(request: {
  headers: { get(name: string): string | null };
}): { ok: true } | { ok: false; status: number; error: string } {
  const expected = readPushWebhookSecret();
  if (!expected) {
    return { ok: false, status: 503, error: "push webhook is not configured" };
  }
  const provided = providedPushWebhookSecret(request);
  if (!pushWebhookSecretsEqual(provided, expected)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
}

export function extractNotificationIdFromWebhookBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const table = String(record.table ?? "").trim();
  const type = String(record.type ?? record.eventType ?? "").trim().toUpperCase();
  if (table && table !== "notifications") return null;
  if (type && type !== "INSERT") return null;

  const row =
    (record.record && typeof record.record === "object"
      ? (record.record as Record<string, unknown>)
      : null) ??
    (record.row && typeof record.row === "object" ? (record.row as Record<string, unknown>) : null) ??
    record;

  const id = row.id ?? record.notification_id ?? record.notificationId;
  const text = String(id ?? "").trim();
  return text || null;
}
