import { NextResponse } from "next/server";
import {
  isSitterProfileComplete,
  SITTER_PROFILES_TABLE,
  type SitterProfileRow
} from "@/lib/sitter/sitter-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isProfileRole, PROFILES_TABLE } from "@/lib/supabase/profiles";

/** Own full sitter profile (includes admin-only columns). Sitter role only. */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authErr
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase.from(PROFILES_TABLE).select("role").eq("id", user.id).maybeSingle();
    if (!isProfileRole(profile?.role) || profile.role !== "sitter") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabase.from(SITTER_PROFILES_TABLE).select("*").eq("id", user.id).maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ profile: data as SitterProfileRow | null });
  } catch (e) {
    console.error("[api/sitter/profile GET]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authErr
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase.from(PROFILES_TABLE).select("role").eq("id", user.id).maybeSingle();
    if (!isProfileRole(profile?.role) || profile.role !== "sitter") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as Partial<SitterProfileRow>;

    const citizenship =
      body.citizenship_israeli === true ? true : body.citizenship_israeli === false ? false : null;

    const merged: Partial<SitterProfileRow> = {
      full_name: body.full_name ?? null,
      show_full_name: Boolean(body.show_full_name),
      id_number: body.id_number ?? null,
      birth_date: body.birth_date ?? null,
      show_age: body.show_age !== false,
      citizenship_israeli: citizenship,
      birth_country: body.birth_country ?? null,
      aliyah_year: body.aliyah_year ?? null,
      address_full: body.address_full ?? null,
      military_service: body.military_service ?? null,
      years_experience:
        body.years_experience !== undefined && body.years_experience !== null
          ? Number(body.years_experience)
          : null,
      preferred_ages: body.preferred_ages ?? null,
      has_car: Boolean(body.has_car),
      languages: body.languages ?? null,
      homework_help: Boolean(body.homework_help),
      light_cooking: Boolean(body.light_cooking)
    };

    const row: Record<string, unknown> = {
      id: user.id,
      ...merged,
      updated_at: new Date().toISOString(),
      onboarding_completed_at: isSitterProfileComplete({ ...merged, id: user.id } as SitterProfileRow)
        ? new Date().toISOString()
        : null
    };

    const { data, error } = await supabase
      .from(SITTER_PROFILES_TABLE)
      .upsert(row, { onConflict: "id" })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ profile: data as SitterProfileRow });
  } catch (e) {
    console.error("[api/sitter/profile PUT]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
