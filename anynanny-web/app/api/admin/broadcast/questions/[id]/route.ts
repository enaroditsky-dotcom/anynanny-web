import { NextResponse } from "next/server";
import { loadBroadcastQuestionResult } from "@/lib/admin/broadcast-question-results-load";
import {
  isBroadcastQuestionId,
  pageBounds,
  parseRespondentStatus,
  publicIdSearchTerm,
  RESPONDENT_PAGE_SIZE
} from "@/lib/admin/broadcast-question-results";
import { requireAdminApi } from "@/lib/admin/require-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const { id } = await context.params;
  if (!isBroadcastQuestionId(id)) {
    return NextResponse.json({ error: "השאלה לא נמצאה." }, { status: 404 });
  }

  const url = new URL(request.url);
  const optionId = url.searchParams.get("option");
  try {
    const result = await loadBroadcastQuestionResult({
      questionId: id,
      page: pageBounds(url.searchParams.get("page"), RESPONDENT_PAGE_SIZE).page,
      status: parseRespondentStatus(url.searchParams.get("status")),
      optionId: optionId && isBroadcastQuestionId(optionId) ? optionId : null,
      query: publicIdSearchTerm(url.searchParams.get("q"))
    });
    if (!result) return NextResponse.json({ error: "השאלה לא נמצאה." }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "unknown option") {
      return NextResponse.json({ error: "התשובה לא שייכת לשאלה." }, { status: 400 });
    }
    return NextResponse.json({ error: "לא הצלחנו לטעון את התוצאות." }, { status: 500 });
  }
}
