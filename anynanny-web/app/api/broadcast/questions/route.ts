import { NextResponse } from "next/server";
import { pageBounds } from "@/lib/admin/broadcast-question-results";
import { listMyBroadcastQuestions, MY_QUESTIONS_PAGE_SIZE, parseMyQuestionStatus } from "@/lib/broadcast/question-inbox";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "יש להתחבר כדי לראות את השאלות." }, { status: 401 });
    }

    const url = new URL(request.url);
    const status = parseMyQuestionStatus(url.searchParams.get("status"));
    const page = pageBounds(url.searchParams.get("page"), MY_QUESTIONS_PAGE_SIZE).page;
    const result = await listMyBroadcastQuestions(supabase, { userId: user.id, status, page });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[broadcast-questions]", error);
    return NextResponse.json({ error: "לא הצלחנו לטעון את השאלות." }, { status: 500 });
  }
}
