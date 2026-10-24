import { NextResponse } from "next/server";
import { countBroadcastRecipients } from "@/lib/admin/broadcast-send";
import {
  previewSelectedBroadcastQuestionRecipients,
  sendAdminBroadcastQuestion,
  sendSelectedAdminBroadcastQuestion
} from "@/lib/admin/broadcast-question-send";
import {
  SELECTED_RECIPIENTS_REJECTED_MESSAGE,
  isSelectedRecipientsRejected,
  requireSelectedPublicIds
} from "@/lib/admin/broadcast-selected-recipients";
import {
  ADMIN_BROADCAST_TEST_UNAVAILABLE_MESSAGE,
  BroadcastTestRecipientError,
  requireDedicatedBroadcastTestUserId
} from "@/lib/admin/broadcast-test-recipient";
import { resolveConfiguredBroadcastTestRecipient } from "@/lib/admin/broadcast-test-recipient-load";
import { validateBroadcastQuestion } from "@/lib/admin/broadcast-question-validation";
import { requireAdminApi } from "@/lib/admin/require-admin";

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
  public_ids?: unknown;
};

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
      const selected = requireSelectedPublicIds(parsed.value.audience, body.public_ids);
      if (!selected.ok) {
        return NextResponse.json({ error: selected.error }, { status: 400 });
      }
      if (selected.ids) {
        const checked = await previewSelectedBroadcastQuestionRecipients(selected.ids);
        return NextResponse.json({
          audience: parsed.value.audience,
          audience_label: parsed.value.audienceLabel,
          recipient_count: checked.recipientCount,
          ok: checked.ok,
          error: checked.error,
          entries: checked.entries.map((entry) => ({
            public_id: entry.publicId,
            role: entry.role,
            ok: entry.ok,
            reason: entry.reason
          })),
          prompt: parsed.value.prompt,
          question_format: parsed.value.questionFormat,
          selection_mode: parsed.value.selectionMode,
          options: parsed.value.options
        });
      }
      const counted = await countBroadcastRecipients(parsed.value.audience);
      return NextResponse.json({
        audience: counted.audience,
        audience_label: parsed.value.audienceLabel,
        recipient_count: counted.recipientCount,
        ok: true,
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
      let testUserId: string;
      try {
        testUserId = requireDedicatedBroadcastTestUserId(await resolveConfiguredBroadcastTestRecipient());
      } catch (error) {
        if (error instanceof BroadcastTestRecipientError) {
          return NextResponse.json({ error: ADMIN_BROADCAST_TEST_UNAVAILABLE_MESSAGE }, { status: 400 });
        }
        throw error;
      }
      const result = await sendAdminBroadcastQuestion({
        message: parsed.value,
        isTest: true,
        testUserId
      });
      return NextResponse.json({
        ok: true,
        test: true,
        question_id: result.questionId,
        recipient_count: result.recipientCount,
        already_sent: result.alreadySent
      });
    }

    const selected = requireSelectedPublicIds(parsed.value.audience, body.public_ids);
    if (!selected.ok) {
      return NextResponse.json({ error: selected.error }, { status: 400 });
    }

    if (selected.ids) {
      const result = await sendSelectedAdminBroadcastQuestion({
        message: parsed.value,
        publicIds: selected.ids
      });
      return NextResponse.json({
        ok: true,
        test: false,
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
    if (isSelectedRecipientsRejected(error)) {
      return NextResponse.json({ error: SELECTED_RECIPIENTS_REJECTED_MESSAGE }, { status: 400 });
    }
    console.error("[admin-broadcast-question]", error);
    const message =
      action === "preview" ? "לא הצלחנו לחשב את מספר הנמענים." : "לא הצלחנו לשלוח את השאלה.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
