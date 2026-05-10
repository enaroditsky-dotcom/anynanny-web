import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Server Components / generic server code — uses the user JWT from cookies (respects RLS). */
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const cookieStore = await cookies();

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          /* Server Component — cookies may be read-only */
        }
      }
    }
  });
}

/**
 * App Router Route Handlers (`app/api/**/route.ts`) only.
 * Supersedes the deprecated `createRouteHandlerClient` from `@supabase/auth-helpers-nextjs` — this
 * project uses `@supabase/ssr` only. Cookie `set` calls must not be swallowed so a refreshed JWT
 * can attach to the handler response (avoids "Auth session missing" after `getUser()` refresh).
 */
export async function createSupabaseRouteHandlerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const cookieStore = await cookies();

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      }
    }
  });
}
