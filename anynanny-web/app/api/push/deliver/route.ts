import { NextResponse } from "next/server";
import { deliverCanonicalNotificationPush } from "@/lib/push/deliver-notification";
import {
  authorizePushWebhook,
  extractNotificationIdFromWebhookBody
} from "@/lib/push/webhook-auth";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import { isWebPushConfigured } from "@/lib/push/web-push-sender";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}

export async function POST(request: Request) {
  const auth = authorizePushWebhook(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isWebPushConfigured()) {
    return NextResponse.json({ error: "web push is not configured" }, { status: 503 });
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const notificationId = extractNotificationIdFromWebhookBody(body);
  if (!notificationId) {
    return NextResponse.json({ ok: true, skipped: true, reason: "ignored payload" });
  }

  try {
    const result = await deliverCanonicalNotificationPush(notificationId, {
      admin: getSupabaseServiceRoleClient()
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "deliver failed";
    console.warn("[push] deliver failed:", message);
    return NextResponse.json({ error: "deliver failed" }, { status: 500 });
  }
}
