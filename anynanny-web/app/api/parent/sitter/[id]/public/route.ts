import { NextResponse } from "next/server";
import type { SitterProfilePublic } from "@/lib/sitter/sitter-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isProfileRole, PROFILES_TABLE } from "@/lib/supabase/profiles";

/**
 * Parent-facing sitter profile — sanitized JSON only (RPC).
 * Hidden fields (ID, address, military) are never returned.
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

    const { data, error } = await supabase.rpc("get_sitter_profile_public", { target_id: id });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (data == null) {
      return NextResponse.json({ profile: null });
    }

    return NextResponse.json({ profile: data as SitterProfilePublic });
  } catch (e) {
    console.error("[api/parent/sitter public GET]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
