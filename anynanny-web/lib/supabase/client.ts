"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (browserClient) return browserClient;
  browserClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return browserClient;
}

/**
 * Calls `public.reload_schema()` when deployed (see sql/create_reload_schema_rpc.sql).
 * PostgREST then reloads its schema cache — fixes stale errors like missing `id` on `sitter_profiles`.
 */
export async function reloadPostgrestSchema(client: SupabaseClient): Promise<boolean> {
  const { error } = await client.rpc("reload_schema");
  return !error;
}
