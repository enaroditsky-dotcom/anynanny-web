import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  isSitterProfileComplete,
  SITTER_PROFILES_TABLE,
  type SitterProfileRow
} from "@/lib/sitter/sitter-profile";
import { isProfileRole, PROFILES_TABLE } from "@/lib/supabase/profiles";

export const dynamic = "force-dynamic";

async function supabaseFromCookies() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      }
    }
  });
}

export async function GET() {
  try {
    const supabase = await supabaseFromCookies();
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
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function PUT(request: Request) {
  try {
    const supabase = await supabaseFromCookies();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase.from(PROFILES_TABLE).select("role").eq("id", user.id).maybeSingle();
    if (!isProfileRole(profile?.role) || profile.role !== "sitter") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as Partial<SitterProfileRow>;

    const { data: existing } = await supabase.from(SITTER_PROFILES_TABLE).select("*").eq("id", user.id).maybeSingle();

    const prev = (existing ?? {}) as Partial<SitterProfileRow>;

    const citizenship =
      body.citizenship_israeli === undefined
        ? prev.citizenship_israeli ?? null
        : body.citizenship_israeli === true
          ? true
          : body.citizenship_israeli === false
            ? false
            : null;

    const merged: Partial<SitterProfileRow> = {
      ...prev,
      full_name: body.full_name !== undefined ? body.full_name : prev.full_name ?? null,
      show_full_name:
        body.show_full_name !== undefined ? Boolean(body.show_full_name) : Boolean(prev.show_full_name),
      id_number: body.id_number !== undefined ? body.id_number : prev.id_number ?? null,
      birth_date: body.birth_date !== undefined ? body.birth_date : prev.birth_date ?? null,
      show_age: body.show_age !== undefined ? body.show_age !== false : prev.show_age !== false,
      citizenship_israeli: citizenship,
      birth_country: body.birth_country !== undefined ? body.birth_country : prev.birth_country ?? null,
      aliyah_year:
        body.aliyah_year !== undefined
          ? numOrNull(body.aliyah_year)
          : prev.aliyah_year ?? null,
      address_full: body.address_full !== undefined ? body.address_full : prev.address_full ?? null,
      military_service: body.military_service !== undefined ? body.military_service : prev.military_service ?? null,
      referee_phone_1: body.referee_phone_1 !== undefined ? body.referee_phone_1 : prev.referee_phone_1 ?? null,
      referee_phone_2: body.referee_phone_2 !== undefined ? body.referee_phone_2 : prev.referee_phone_2 ?? null,
      years_experience:
        body.years_experience !== undefined ? numOrNull(body.years_experience) : prev.years_experience ?? null,
      preferred_ages: body.preferred_ages !== undefined ? body.preferred_ages : prev.preferred_ages ?? null,
      has_car: body.has_car !== undefined ? Boolean(body.has_car) : Boolean(prev.has_car),
      languages: body.languages !== undefined ? body.languages : prev.languages ?? null,
      homework_help: body.homework_help !== undefined ? Boolean(body.homework_help) : Boolean(prev.homework_help),
      light_cooking: body.light_cooking !== undefined ? Boolean(body.light_cooking) : Boolean(prev.light_cooking),
      bio: body.bio !== undefined ? body.bio : prev.bio ?? null,
      hourly_rate_nis:
        body.hourly_rate_nis !== undefined ? numOrNull(body.hourly_rate_nis) : prev.hourly_rate_nis ?? null,
      legal_no_criminal_declaration:
        body.legal_no_criminal_declaration !== undefined
          ? Boolean(body.legal_no_criminal_declaration)
          : Boolean(prev.legal_no_criminal_declaration)
    };

    const complete = isSitterProfileComplete({ ...merged, id: user.id } as SitterProfileRow);

    const row: Record<string, unknown> = {
      id: user.id,
      ...merged,
      is_public: complete,
      onboarding_completed_at: complete ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
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
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
