import { applyDiditWebhookDecision, alreadyProcessedDiditEvent, markDiditEventProcessed, parseUuid } from "@/lib/identity/didit-db";
import { readDiditWebhookSecret } from "@/lib/identity/didit";
import { verifyDiditWebhook } from "@/lib/identity/didit-signature";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(body: string, status: number) {
  return new Response(body, { status });
}

export async function GET() {
  return text("method not allowed", 405);
}

export async function POST(req: Request) {
  const raw = await req.text();
  const verified = verifyDiditWebhook({
    rawBody: raw,
    signature: req.headers.get("x-signature-v2"),
    timestampHeader: req.headers.get("x-timestamp"),
    secret: readDiditWebhookSecret()
  });

  if (!verified.ok) {
    return text(verified.error, verified.status);
  }

  const parsed = verified.payload;
  const eventId =
    String(parsed.event_id ?? "").trim() ||
    [parsed.session_id, parsed.webhook_type, parsed.timestamp].filter(Boolean).join(":");

  let admin;
  try {
    admin = getSupabaseServiceRoleClient();
  } catch {
    return text("server_misconfigured", 503);
  }

  try {
    if (eventId && (await alreadyProcessedDiditEvent(admin, eventId))) {
      return text("ok", 200);
    }

    await applyDiditWebhookDecision(admin, parsed);
    if (eventId) {
      await markDiditEventProcessed(admin, {
        eventId,
        sessionId: parseUuid(parsed.session_id),
        webhookType: parsed.webhook_type ? String(parsed.webhook_type) : null,
        status: parsed.status ? String(parsed.status) : null
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhook_apply_failed";
    console.warn("[didit-webhook]", message);
    return text("apply_failed", 500);
  }

  return text("ok", 200);
}
