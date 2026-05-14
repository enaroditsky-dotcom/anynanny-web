"use client";

import { createBrowserClient, type SupabaseClient } from "@supabase/ssr";

let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Cookie-backed client so Route Handlers / middleware see the same session as the browser
 * (plain `createClient` kept tokens in localStorage only → `/api/*` returned 401).
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
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
