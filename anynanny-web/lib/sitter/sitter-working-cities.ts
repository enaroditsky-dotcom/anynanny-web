"use client";

/**
 * Direct browser writes to public.sitter_profiles.working_cities.
 *
 * Equivalent shape:
 *   supabase.from("sitter_profiles").update({ working_cities: cities }).eq("id", userId)
 *
 * Uses SITTER_PROFILES_USER_COLUMN (default "id") when env overrides the FK column.
 */

import { normalizeWorkingCities, type IsraelCity } from "@/lib/geo/israel-cities";
import {
  SITTER_PROFILES_TABLE,
  SITTER_PROFILES_USER_COLUMN,
  SITTER_WORKING_CITIES_COLUMN
} from "@/lib/sitter/sitter-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export const SITTER_WORKING_CITIES_SAVE_SUCCESS_MESSAGE =
  "אזורי השירות עודכנו בהצלחה!" as const;

export type SitterWorkingCitiesResult =
  | { ok: true; cities: IsraelCity[] }
  | { ok: false; error: string };

function emptyWorkingCitiesLoad(): SitterWorkingCitiesResult {
  return { ok: true, cities: [] };
}

export async function loadSitterWorkingCities(userId: string): Promise<SitterWorkingCitiesResult> {
  try {
    if (!userId.trim()) {
      console.warn("Working cities column not ready yet, defaulting to empty array.");
      return emptyWorkingCitiesLoad();
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      console.warn("Working cities column not ready yet, defaulting to empty array.");
      return emptyWorkingCitiesLoad();
    }

    const { data, error } = await supabase
      .from(SITTER_PROFILES_TABLE)
      .select(SITTER_WORKING_CITIES_COLUMN)
      .eq(SITTER_PROFILES_USER_COLUMN, userId)
      .maybeSingle();

    if (error) {
      console.warn("Working cities column not ready yet, defaulting to empty array.");
      return emptyWorkingCitiesLoad();
    }

    if (!data || typeof data !== "object") {
      return emptyWorkingCitiesLoad();
    }

    const raw = (data as Record<string, unknown>)[SITTER_WORKING_CITIES_COLUMN];
    if (raw == null) {
      return emptyWorkingCitiesLoad();
    }

    return { ok: true, cities: normalizeWorkingCities(raw) };
  } catch {
    console.warn("Working cities column not ready yet, defaulting to empty array.");
    return emptyWorkingCitiesLoad();
  }
}

function updateFailure(message: string): SitterWorkingCitiesResult {
  return { ok: false, error: message };
}

/** Persist working cities on `public.sitter_profiles.working_cities`. Never throws. */
export async function updateSitterWorkingCities(
  userId: string,
  cities: IsraelCity[]
): Promise<SitterWorkingCitiesResult> {
  try {
    const normalized = normalizeWorkingCities(cities);

    if (normalized.length === 0) {
      console.warn("[sitter-working-cities] update skipped: no cities selected.");
      return updateFailure("יש לבחור לפחות עיר אחת.");
    }

    if (!userId.trim()) {
      console.warn("[sitter-working-cities] update skipped: missing user id.");
      return updateFailure("מזהה משתמש חסר.");
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      console.warn("[sitter-working-cities] update skipped: Supabase client unavailable.");
      return updateFailure("Supabase לא מוגדר.");
    }

    const { error } = await supabase
      .from(SITTER_PROFILES_TABLE)
      .update({
        [SITTER_WORKING_CITIES_COLUMN]: normalized,
        updated_at: new Date().toISOString()
      })
      .eq(SITTER_PROFILES_USER_COLUMN, userId);

    if (error) {
      console.warn("[sitter-working-cities] update failed:", error.message);
      return updateFailure(error.message || "שגיאת מסד נתונים.");
    }

    return { ok: true, cities: normalized };
  } catch (err) {
    const message =
      err instanceof Error && err.message.trim()
        ? err.message.trim()
        : "שמירת אזורי העבודה נכשלה.";
    console.warn("[sitter-working-cities] update exception:", message);
    return updateFailure(message);
  }
}

/** UI-friendly save outcome (`success` mirrors `ok` on SitterWorkingCitiesResult). */
export type WorkingCitiesSaveOutcome =
  | { success: true; cities: IsraelCity[] }
  | { success: false; error: string };

export function toWorkingCitiesSaveOutcome(result: SitterWorkingCitiesResult): WorkingCitiesSaveOutcome {
  if (result.ok) {
    return { success: true, cities: result.cities };
  }
  return { success: false, error: result.error };
}

/** @alias updateSitterWorkingCities */
export const saveSitterWorkingCities = updateSitterWorkingCities;
