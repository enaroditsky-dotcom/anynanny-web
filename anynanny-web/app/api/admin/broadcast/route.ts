import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/require-admin";
import {
  countBroadcastRecipients,
  sendAdminBroadcast,
  sendBroadcastTestToUser
} from "@/lib/admin/broadcast-send";
import { validateBroadcastMessage } from "@/lib/admin/broadcast-validation";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type BroadcastAction = "preview" | "test" | "send";

type RequestBody = {
  action?: unknown;
  audience?: unknown;
  title?: unknown;
  body?: unknown;
  cta_label?: unknown;
  cta_route?: unknown;
  idempotency_key?: unknown;
};

async function signedInUserId(): Promise<string | null> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    return user?.id?.trim() || null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  let body: RequestBody = {};
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const action = String(body.action ?? "").trim() as BroadcastAction;
  if (action !== "preview" && action !== "test" && action !== "send") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const parsed = validateBroadcastMessage({
    audience: body.audience,
    title: body.title,
    body: body.body,
    ctaLabel: body.cta_label,
    ctaRoute: body.cta_route,
    idempotencyKey: body.idempotency_key
  });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    if (action === "preview") {
      const counted = await countBroadcastRecipients(parsed.value.audience);
      return NextResponse.json({
        audience: counted.audience,
        audience_label: parsed.value.audienceLabel,
        recipient_count: counted.recipientCount,
        title: parsed.value.title,
        body: parsed.value.body,
        cta_label: parsed.value.ctaLabel,
        cta_route: parsed.value.ctaRoute
      });
    }

    if (action === "test") {
      const userId = await signedInUserId();
      if (!userId) {
        return NextResponse.json(
          {
            error:
              "יש להתחבר גם כמשתמש AnyNanny כדי לשלוח הודעת בדיקה לעצמך. סשן האדמין בלבד אינו מזהה נמען."
          },
          { status: 400 }
        );
      }
      const result = await sendBroadcastTestToUser(userId, parsed.value);
      return NextResponse.json({
        ok: true,
        test: true,
        notification_id: result.notificationId,
        recipient_count: 1
      });
    }

    if (!parsed.value.idempotencyKey) {
      return NextResponse.json({ error: "Missing idempotency key." }, { status: 400 });
    }

    const result = await sendAdminBroadcast(parsed.value);
    return NextResponse.json({
      ok: true,
      test: false,
      broadcast_id: result.broadcastId,
      recipient_count: result.recipientCount,
      already_sent: result.alreadySent
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Broadcast failed." },
      { status: 500 }
    );
  }
}
