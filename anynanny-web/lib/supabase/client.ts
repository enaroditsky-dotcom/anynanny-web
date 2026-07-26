"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Cookie-backed browser client via `@supabase/ssr`.
 * Uses default cookie encoding (`base64url`) so session cookies match the
 * server/middleware clients — do not JSON.parse those cookie strings manually;
 * use `safeParseSupabaseCookieJson` from `@/lib/supabase/cookie-value` if needed.
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

export async function reloadPostgrestSchema(client: SupabaseClient): Promise<boolean> {
  const { error } = await client.rpc("reload_schema");
  return !error;
}
