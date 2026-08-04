import { NextResponse } from "next/server";
import type { PublicSitterReview, SitterProfilePublic } from "@/lib/sitter/sitter-profile";
import {
  fetchParentSitterProfile,
  fetchSitterPublicReviews
} from "@/lib/sitter/fetch-parent-sitter-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isProfileRole, PROFILES_TABLE } from "@/lib/supabase/profiles";
import {
  isPostgrestMissingFunctionError,
  isSupabaseRpcUnavailableError
} from "@/lib/supabase/postgrest-schema";

/**
 * Parent-facing sitter profile — sanitized JSON only.
 * Prefers direct sitter_profiles read; falls back to RPC when available.
 * Hidden fields (ID, address, military) are never returned.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!id || id === "undefined") {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

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

    // Prefer the resilient loader (direct table → RPC) so missing RPCs do not 404 the UI.
    const loaded = await fetchParentSitterProfile(supabase, id);
    if (loaded.error) {
      return NextResponse.json({ error: loaded.error }, { status: 400 });
    }

    if (loaded.profile) {
      return NextResponse.json({
        profile: loaded.profile,
        reviews: loaded.reviews
      });
    }

    // Last resort: RPC-only path (may be absent in some envs).
    const [{ data: profileJson, error: profErr }, reviews] = await Promise.all([
      supabase.rpc("get_sitter_profile_public", { target_id: id }),
      fetchSitterPublicReviews(supabase, id, 3)
    ]);

    if (profErr) {
      if (
        isPostgrestMissingFunctionError(profErr.message) ||
        isSupabaseRpcUnavailableError(profErr)
      ) {
        return NextResponse.json({ profile: null, reviews: [] as PublicSitterReview[] });
      }
      return NextResponse.json({ error: profErr.message }, { status: 400 });
    }

    if (profileJson == null) {
      return NextResponse.json({ profile: null, reviews: [] as PublicSitterReview[] });
    }

    return NextResponse.json({
      profile: profileJson as SitterProfilePublic,
      reviews
    });
  } catch (e) {
    console.error("[api/parent/sitter public GET]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}