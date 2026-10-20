import { NextResponse } from "next/server";
import { countBroadcastRecipients } from "@/lib/admin/broadcast-send";
import { sendAdminBroadcastQuestion } from "@/lib/admin/broadcast-question-send";
import { validateBroadcastQuestion } from "@/lib/admin/broadcast-question-validation";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type QuestionAction = "preview" | "test" | "send";

type RequestBody = {
  action?: unknown;
  audience?: unknown;
  prompt?: unknown;
  question_format?: unknown;
  selection_mode?: unknown;
  options?: unknown;
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

  const action = String(body.action ?? "").trim() as QuestionAction;
  if (action !== "preview" && action !== "test" && action !== "send") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const parsed = validateBroadcastQuestion({
    audience: body.audience,
    prompt: body.prompt,
    questionFormat: body.question_format,
    selectionMode: body.selection_mode,
    options: body.options,
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
        prompt: parsed.value.prompt,
        question_format: parsed.value.questionFormat,
        selection_mode: parsed.value.selectionMode,
        options: parsed.value.options
      });
    }

    if (!parsed.value.idempotencyKey) {
      return NextResponse.json({ error: "Missing idempotency key." }, { status: 400 });
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
      const result = await sendAdminBroadcastQuestion({
        message: parsed.value,
        isTest: true,
        testUserId: userId
      });
      return NextResponse.json({
        ok: true,
        test: true,
        question_id: result.questionId,
        recipient_count: result.recipientCount,
        already_sent: result.alreadySent
      });
    }

    const result = await sendAdminBroadcastQuestion({
      message: parsed.value,
      isTest: false,
      testUserId: null
    });
    return NextResponse.json({
      ok: true,
      test: false,
      question_id: result.questionId,
      recipient_count: result.recipientCount,
      already_sent: result.alreadySent
    });
  } catch (error) {
    console.error("[admin-broadcast-question]", error);
    const message =
      action === "preview" ? "לא הצלחנו לחשב את מספר הנמענים." : "לא הצלחנו לשלוח את השאלה.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
