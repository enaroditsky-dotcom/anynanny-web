import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { RATINGS_TABLE } from "@/lib/ratings/constants";
import { SESSIONS_TABLE } from "@/lib/session/protocol";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();

    // @supabase/auth-helpers-nextjs types assume sync `cookies()`; Next 15 returns a Promise.
    // Passing the awaited store restores correct cookie reads for this request.
    const supabase = createRouteHandlerClient({
      cookies: () => cookieStore as unknown as ReturnType<typeof cookies>
    });

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    const session = sessionData.session;
    console.log("[api/ratings] auth snapshot", {
      hasSession: Boolean(session),
      sessionUserId: session?.user?.id ?? null,
      sessionError: sessionErr?.message ?? null,
      cookieCount: cookieStore.getAll().length,
      cookieNames: cookieStore.getAll().map((c) => c.name)
    });

    const {
      data: { user },
      error: authErr
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        {
          error:
            "לא זוהה התחברות בשרת — בקשת הדירוג הגיעה בלי עוגיית Supabase תקינה. התחברו מחדש באותו דפדפן, או ודאו שאין חסימת עוגיות / מצב פרטי.",
          detail: authErr?.message ?? (!session ? "אין session בשרת (getSession ריק)." : "getUser נכשל — ייתכן JWT פג תוקף."),
          code: "AUTH_MISSING_OR_INVALID"
        },
        { status: 401 }
      );
    }

    const body = (await request.json()) as {
      session_id?: unknown;
      rating?: unknown;
      comment?: string | null;
    };
    const sessionId =
      typeof body.session_id === "string"
        ? body.session_id.trim()
        : body.session_id != null && typeof body.session_id !== "object"
          ? String(body.session_id).trim()
          : "";
    const ratingRaw = body.rating;
    const rating =
      typeof ratingRaw === "number" && Number.isFinite(ratingRaw)
        ? ratingRaw
        : typeof ratingRaw === "string" && ratingRaw.trim() !== ""
          ? Number(ratingRaw.trim())
          : NaN;
    const commentRaw = body.comment;
    const comment =
      commentRaw === undefined || commentRaw === null
        ? null
        : typeof commentRaw === "string"
          ? commentRaw.trim().slice(0, 2000) || null
          : null;

    const uuidOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId);
    if (!sessionId || !uuidOk) {
      return NextResponse.json({ error: "session_id must be a valid UUID" }, { status: 400 });
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "rating must be an integer 1–5" }, { status: 400 });
    }

    const { data: sessionRow, error: sessErr } = await supabase
      .from(SESSIONS_TABLE)
      .select("id, parent_id, sitter_id, status")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessErr || !sessionRow) {
      return NextResponse.json({ error: sessErr?.message ?? "Session not found" }, { status: 400 });
    }

    const parentId = sessionRow.parent_id != null ? String(sessionRow.parent_id) : null;
    const sitterId = sessionRow.sitter_id != null ? String(sessionRow.sitter_id) : null;
    const uid = user.id;

    const isParent = parentId === uid;
    const isSitter = sitterId === uid;
    if (!isParent && !isSitter) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (String(sessionRow.status) !== "completed") {
      return NextResponse.json({ error: "Session must be completed before rating" }, { status: 400 });
    }

    let toUserId: string | null = null;
    if (isParent) {
      if (!sitterId) {
        return NextResponse.json({ error: "No sitter assigned to this session" }, { status: 400 });
      }
      toUserId = sitterId;
    } else {
      if (!parentId) {
        return NextResponse.json({ error: "Session has no parent" }, { status: 400 });
      }
      toUserId = parentId;
    }

    if (toUserId === uid) {
      return NextResponse.json({ error: "Invalid rating target" }, { status: 400 });
    }

    const ratingStars = rating;

    const { error: insErr } = await supabase.from(RATINGS_TABLE).insert({
      session_id: sessionId,
      from_user_id: uid,
      to_user_id: toUserId,
      rating: ratingStars,
      comment
    });

    if (insErr) {
      const msg = insErr.message ?? "Insert failed";
      if (msg.includes("duplicate") || msg.includes("unique")) {
        return NextResponse.json({ error: "Already rated this session" }, { status: 409 });
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/ratings] unhandled", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
