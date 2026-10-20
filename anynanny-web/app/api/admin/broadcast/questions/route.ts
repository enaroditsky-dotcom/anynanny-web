import { NextResponse } from "next/server";
import { listBroadcastQuestionHistory } from "@/lib/admin/broadcast-question-results-load";
import {
  pageBounds,
  parseAudienceFilter,
  parseQuestionResultScope,
  QUESTION_HISTORY_PAGE_SIZE
} from "@/lib/admin/broadcast-question-results";
import { requireAdminApi } from "@/lib/admin/require-admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const url = new URL(request.url);
  const scope = parseQuestionResultScope(url.searchParams.get("scope"));
  const audience = parseAudienceFilter(url.searchParams.get("audience"));
  const page = pageBounds(url.searchParams.get("page"), QUESTION_HISTORY_PAGE_SIZE).page;

  try {
    const result = await listBroadcastQuestionHistory({ scope, audience, page });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "לא הצלחנו לטעון את השאלות." }, { status: 500 });
  }
}
