import { NextResponse } from "next/server";
import type { PublicSitterReview, SitterProfilePublic } from "@/lib/sitter/sitter-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isProfileRole, PROFILES_TABLE } from "@/lib/supabase/profiles";

function parseReviewsPayload(raw: unknown): PublicSitterReview[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x): x is PublicSitterReview => x != null && typeof x === "object");
  }
  return [];
}

/**
 * Parent-facing sitter profile — sanitized JSON only (RPC).
 * Hidden fields (ID, address, military) are never returned.
 * Includes last reviews (text only) via `get_sitter_public_reviews`.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!id || id === "undefined") {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authErr
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase.from(PROFILES_TABLE).select("role").eq("id", user.id).maybeSingle();
    if (!isProfileRole(profile?.role) || profile.role !== "parent") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [{ data: profileJson, error: profErr }, { data: reviewsRaw, error: revErr }] = await Promise.all([
      supabase.rpc("get_sitter_profile_public", { target_id: id }),
      supabase.rpc("get_sitter_public_reviews", { p_sitter_id: id, p_limit: 3 })
    ]);

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 400 });
    }

    if (revErr) {
      console.warn("[api/parent/sitter public GET] reviews rpc:", revErr.message);
    }

    if (profileJson == null) {
      return NextResponse.json({ profile: null, reviews: [] as PublicSitterReview[] });
    }

    const reviews = parseReviewsPayload(reviewsRaw);

    return NextResponse.json({
      profile: profileJson as SitterProfilePublic,
      reviews
    });
  } catch (e) {
    console.error("[api/parent/sitter public GET]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
