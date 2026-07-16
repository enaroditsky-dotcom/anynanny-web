import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { NannyProfile, NannyRating } from "@/lib/ratings/types";

// --- ניהול פרופילים מול ה-Database ---

export async function listProfiles(): Promise<NannyProfile[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('*');

  if (error) {
    console.error("Error fetching profiles:", error);
    return [];
  }
  return data as NannyProfile[];
}

export async function saveProfiles(entries: NannyProfile[]): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;

  // שימוש ב-upsert כדי לעדכן או ליצור רשומות
  const { error } = await supabase
    .from('profiles')
    .upsert(entries, { onConflict: 'anyNannyId' });
    
  if (error) console.error("Error saving profiles:", error);
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