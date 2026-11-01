import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { NannyProfile, NannyRating } from "@/lib/ratings/types";

// --- ניהול פרופילים מול ה-Database ---

/** Legacy helper. profiles is owner-row only and is not a nanny directory. */
export async function listProfiles(): Promise<NannyProfile[]> {
  return [];
}

/** Legacy helper. Do not upsert arbitrary rows into public.profiles. */
export async function saveProfiles(_entries: NannyProfile[]): Promise<void> {
  return;
}

// --- ניהול דירוגים מול ה-Database ---

export async function listRatings(): Promise<NannyRating[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('ratings')
    .select('*');

  if (error) {
    console.error("Error fetching ratings:", error);
    return [];
  }
  return data as NannyRating[];
}

export async function appendRating(entry: NannyRating): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;

  const { error } = await supabase
    .from('ratings')
    .insert(entry);
    
  if (error) console.error("Error appending rating:", error);
}