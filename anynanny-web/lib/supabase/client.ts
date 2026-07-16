"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Cookie-backed browser client
 * התיקון: הוספנו הגדרה מפורשת שמונעת את השגיאות בפיענוח ה-Cookies
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (browserClient) return browserClient;

  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
        // זה החלק החשוב ביותר למניעת שגיאות ה-JSON ב-Cookie
        storageKey: 'anynanny_auth_token_v1', 
      }
    }
  );
  return browserClient;
}

export async function reloadPostgrestSchema(client: SupabaseClient): Promise<boolean> {
  const { error } = await client.rpc("reload_schema");
  return !error;
}