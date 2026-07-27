import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RATINGS_TABLE } from "@/lib/ratings/constants";
import { SESSIONS_TABLE } from "@/lib/session/protocol";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // Use @supabase/ssr — auth-helpers crashes on `base64-...` session cookies.
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });
    }

    const {
      data: { user },
      error: authErr
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      console.warn("[api/ratings] unauthenticated", authErr?.message ?? "no user");
      return NextResponse.json(
        {
          error: "Unauthorized",
          detail: authErr?.message ?? "No Supabase session on server.",
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
