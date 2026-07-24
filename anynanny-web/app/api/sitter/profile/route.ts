import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  formatSitterWorkingCitiesError,
  getSitterProfilesTable,
  isSitterProfileComplete,
  SITTER_PROFILES_TABLE,
  SITTER_PROFILES_USER_COLUMN,
  SITTER_WORKING_CITIES_COLUMN,
  type SitterProfileRow
} from "@/lib/sitter/sitter-profile";
import { isProfileRole, PROFILES_TABLE } from "@/lib/supabase/profiles";
import { normalizeWorkingCities } from "@/lib/geo/israel-cities";

export const dynamic = "force-dynamic";

function userIsSitter(profile: { role?: string } | null | undefined, user: User): boolean {
  let role = profile?.role;
  if (!isProfileRole(role)) {
    const meta = user.user_metadata?.role;
    role = typeof meta === "string" && isProfileRole(meta) ? meta : undefined;
  }
  return role === "sitter";
}

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
    if (!userIsSitter(profile, user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const fk = SITTER_PROFILES_USER_COLUMN;
    const table = getSitterProfilesTable() as typeof SITTER_PROFILES_TABLE;
    const { data, error } = await supabase.from(table).select("*").eq(fk, user.id).maybeSingle();

    if (error) {
      console.error("[api/sitter/profile GET]", { table, userId: user.id, message: error.message });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ profile: data as SitterProfileRow | null });
  } catch (err) {
    console.error("[api/sitter/profile GET] exception:", err);
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
    if (!userIsSitter(profile, user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as Partial<SitterProfileRow>;

    const fk = SITTER_PROFILES_USER_COLUMN;
    const table = getSitterProfilesTable() as typeof SITTER_PROFILES_TABLE;
    const { data: existing } = await supabase.from(table).select("*").eq(fk, user.id).maybeSingle();

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
      first_name: body.first_name !== undefined ? body.first_name : prev.first_name ?? null,
      last_name: body.last_name !== undefined ? body.last_name : prev.last_name ?? null,
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
      working_cities:
        body.working_cities !== undefined
          ? normalizeWorkingCities(body.working_cities)
          : normalizeWorkingCities(prev.working_cities),
      legal_no_criminal_declaration:
        body.legal_no_criminal_declaration !== undefined
          ? Boolean(body.legal_no_criminal_declaration)
          : Boolean(prev.legal_no_criminal_declaration)
    };

    const complete = isSitterProfileComplete({ ...merged, id: user.id } as SitterProfileRow);

    const row: Record<string, unknown> = {
      ...merged,
      [fk]: user.id,
      is_public: complete,
      onboarding_completed_at: complete ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };
    if (fk === "user_id") delete row.id;
    if (fk === "id") delete row.user_id;

    const { data, error } = await supabase
      .from(table)
      .upsert(row, { onConflict: fk })
      .select("*")
      .single();

    if (error) {
      console.error("[api/sitter/profile PUT]", { table, userId: user.id, message: error.message });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ profile: data as SitterProfileRow });
  } catch (err) {
    console.error("[api/sitter/profile PUT] exception:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** Patch service areas only - used by sitter profile city picker confirm button. */
export async function PATCH(request: Request) {
  try {
    const supabase = await supabaseFromCookies();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase.from(PROFILES_TABLE).select("role").eq("id", user.id).maybeSingle();
    if (!userIsSitter(profile, user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as { working_cities?: unknown };
    const working_cities = normalizeWorkingCities(body.working_cities);

    if (working_cities.length === 0) {
      return NextResponse.json({ error: "יש לבחור לפחות עיר אחת." }, { status: 400 });
    }

    const fk = SITTER_PROFILES_USER_COLUMN;
    const table = getSitterProfilesTable() as typeof SITTER_PROFILES_TABLE;

    const { data, error } = await supabase
      .from(table)
      .update({
        [SITTER_WORKING_CITIES_COLUMN]: working_cities,
        updated_at: new Date().toISOString()
      })
      .eq(fk, user.id)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("DB error:", error);
      const message = formatSitterWorkingCitiesError(error.message);
      console.error("[api/sitter/profile PATCH working_cities]", {
        table,
        column: SITTER_WORKING_CITIES_COLUMN,
        userId: user.id,
        working_cities,
        message: error.message
      });
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ profile: data as SitterProfileRow | null });
  } catch (err) {
    console.error("[api/sitter/profile PATCH] exception:", err);
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
