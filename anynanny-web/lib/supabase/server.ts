import "server-only";
import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { safeParseSupabaseCookieJson } from "@/lib/supabase/cookie-value";

export {
  decodeSupabaseCookieValue,
  safeParseSupabaseCookieJson
} from "@/lib/supabase/cookie-value";

export async function createServerClient() {
  const cookieStore = await cookies();

  return createSsrServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components may not allow cookie mutation.
          }
        }
      }
    }
  );
}

export { createServerClient as createSupabaseServerClient };

export function parseRequestCookieHeader(
  header: string
): { name: string; value: string }[] {
  if (!header || !header.trim()) return [];

  return header.split(";").flatMap((part) => {
    const trimmed = part.trim();
    if (!trimmed) return [];

    const separator = trimmed.indexOf("=");
    if (separator <= 0) return [];

    return [
      {
        name: trimmed.slice(0, separator).trim(),
        value: trimmed.slice(separator + 1).trim()
      }
    ];
  });
}

export function parseRequestCookiesWithSafeJson(
  header: string
): { name: string; value: string; json: unknown | null }[] {
  return parseRequestCookieHeader(header).map(({ name, value }) => ({
    name,
    value,
    json: safeParseSupabaseCookieJson(value)
  }));
}