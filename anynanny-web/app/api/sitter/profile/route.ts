import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  buildSitterProfilePutRow,
  extractMissingSitterProfileColumn,
  formatSitterWorkingCitiesError,
  getSitterProfilesTable,
  isSitterProfileComplete,
  normalizePreferredAges,
  normalizeSitterLanguages,
  SITTER_PROFILES_TABLE,
  SITTER_PROFILES_USER_COLUMN,
  SITTER_WORKING_CITIES_COLUMN,
  type SitterProfileRow
} from "@/lib/sitter/sitter-profile";
import { isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";
import { isProfileRole, PROFILES_TABLE } from "@/lib/supabase/profiles";
import { normalizeWorkingCities } from "@/lib/geo/israel-cities";
import {
  clampExpertBio,
  normalizeExpertServiceTypes,
  normalizePricingModel,
  normalizeServiceLocations
} from "@/lib/sitter/expert-profile";

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

    // Only merge fields that exist on production sitter_profiles.
    // Do not include legal_no_criminal_declaration — missing on some schemas.
    const merged: Record<string, unknown> = {
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
      preferred_ages:
        body.preferred_ages !== undefined
          ? normalizePreferredAges(body.preferred_ages)
          : normalizePreferredAges(prev.preferred_ages),
      has_car: body.has_car !== undefined ? Boolean(body.has_car) : Boolean(prev.has_car),
      // Always a JS string[] for Postgres text[] — never a comma-separated string.
      languages:
        body.languages !== undefined
          ? normalizeSitterLanguages(body.languages)
          : normalizeSitterLanguages(prev.languages),
      homework_help: body.homework_help !== undefined ? Boolean(body.homework_help) : Boolean(prev.homework_help),
      light_cooking: body.light_cooking !== undefined ? Boolean(body.light_cooking) : Boolean(prev.light_cooking),
      bio: body.bio !== undefined ? clampExpertBio(String(body.bio ?? "")) || null : prev.bio ?? null,
      hourly_rate_nis:
        body.hourly_rate_nis !== undefined ? numOrNull(body.hourly_rate_nis) : prev.hourly_rate_nis ?? null,
      package_price_nis:
        body.package_price_nis !== undefined
          ? numOrNull(body.package_price_nis)
          : prev.package_price_nis ?? null,
      pricing_model:
        body.pricing_model !== undefined
          ? normalizePricingModel(body.pricing_model)
          : normalizePricingModel(prev.pricing_model),
      service_types:
        body.service_types !== undefined
          ? normalizeExpertServiceTypes(body.service_types)
          : normalizeExpertServiceTypes(prev.service_types),
      service_locations:
        body.service_locations !== undefined
          ? normalizeServiceLocations(body.service_locations)
          : normalizeServiceLocations(prev.service_locations),
      certifications:
        body.certifications !== undefined
          ? String(body.certifications ?? "").trim() || null
          : prev.certifications ?? null,
      working_cities:
        body.working_cities !== undefined
          ? normalizeWorkingCities(body.working_cities)
          : normalizeWorkingCities(prev.working_cities)
    };

    const complete = isSitterProfileComplete({ ...merged, id: user.id } as SitterProfileRow);

    const row = buildSitterProfilePutRow(
      {
        ...merged,
        is_public: complete,
        onboarding_completed_at: complete ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      },
      user.id,
      fk
    );

    let data: SitterProfileRow | null = null;
    let lastError: string | null = null;

    for (let attempt = 0; attempt < 6; attempt++) {
      const result = await supabase.from(table).upsert(row, { onConflict: fk }).select("*").single();

      if (!result.error) {
        data = result.data as SitterProfileRow;
        lastError = null;
        break;
      }

      lastError = result.error.message;
      const missingColumn = extractMissingSitterProfileColumn(lastError);
      if (
        missingColumn &&
        Object.prototype.hasOwnProperty.call(row, missingColumn) &&
        isPostgrestSchemaDriftError(lastError)
      ) {
        console.warn("[api/sitter/profile PUT] omitting missing column and retrying", {
          table,
          userId: user.id,
          missingColumn
        });
        delete row[missingColumn];
        continue;
      }

      console.error("[api/sitter/profile PUT]", { table, userId: user.id, message: lastError });
      return NextResponse.json({ error: lastError }, { status: 400 });
    }

    if (!data) {
      console.error("[api/sitter/profile PUT]", { table, userId: user.id, message: lastError });
      return NextResponse.json({ error: lastError || "שמירת הפרופיל נכשלה." }, { status: 400 });
    }

    return NextResponse.json({ profile: data });
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
