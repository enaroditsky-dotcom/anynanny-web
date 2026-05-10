import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function requireSupabaseEnv(): { url: string; anon: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return { url, anon };
}

/** Server Components / generic server — JWT from cookies (respects RLS). */
export async function createSupabaseServerClient() {
  const { url, anon } = requireSupabaseEnv();
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

/** App Router Route Handlers only — do not swallow cookie writes so JWT refresh attaches to the response. */
export async function createSupabaseRouteHandlerClient() {
  const { url, anon } = requireSupabaseEnv();
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
