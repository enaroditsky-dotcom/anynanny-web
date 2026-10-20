import { NextResponse } from "next/server";
import { closeBroadcastQuestion } from "@/lib/admin/broadcast-question-results-load";
import { isBroadcastQuestionId } from "@/lib/admin/broadcast-question-results";
import { requireAdminApi } from "@/lib/admin/require-admin";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const { id } = await context.params;
  if (!isBroadcastQuestionId(id)) {
    return NextResponse.json({ error: "השאלה לא נמצאה." }, { status: 404 });
  }

  try {
    const result = await closeBroadcastQuestion(id);
    return NextResponse.json({
      question_id: result.questionId,
      closed_at: result.closedAt,
      already_closed: result.alreadyClosed
    });
  } catch {
    return NextResponse.json({ error: "לא הצלחנו לסגור את השאלה." }, { status: 500 });
  }
}
