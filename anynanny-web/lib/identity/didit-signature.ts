import crypto from "node:crypto";
import { canonicalizeDiditWebhookBody } from "@/lib/identity/didit";

export function hmacSha256Hex(secret: string, canonical: string): string {
  return crypto.createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
}

export function timingSafeHexEqual(expected: string, provided: string): boolean {
  const left = Buffer.from(expected.toLowerCase());
  const right = Buffer.from(provided.toLowerCase());
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export type DiditWebhookVerifyResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; status: number; error: string };

export function verifyDiditWebhook(input: {
  rawBody: string;
  signature: string | null;
  timestampHeader: string | null;
  secret: string;
  nowMs?: number;
}): DiditWebhookVerifyResult {
  const secret = input.secret.trim();
  if (!secret) {
    return { ok: false, status: 503, error: "webhook_not_configured" };
  }

  const ts = Number(input.timestampHeader);
  const nowSec = (input.nowMs ?? Date.now()) / 1000;
  if (!ts || !Number.isFinite(ts) || Math.abs(nowSec - ts) > 300) {
    return { ok: false, status: 401, error: "stale" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.rawBody);
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }

  const canonical = canonicalizeDiditWebhookBody(parsed);
  const expected = hmacSha256Hex(secret, canonical);
  const sig = String(input.signature ?? "").trim();
  if (!timingSafeHexEqual(expected, sig)) {
    return { ok: false, status: 401, error: "bad_sig" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, status: 400, error: "invalid_payload" };
  }

  return { ok: true, payload: parsed as Record<string, unknown> };
}
