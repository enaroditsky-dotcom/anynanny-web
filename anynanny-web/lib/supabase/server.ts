import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function parseRequestCookieHeader(header: string): { name: string; value: string }[] {
  if (!header.trim()) return [];

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

export async function createSupabaseServerClient(request?: Request) {
  const cookieStore = await cookies();
  const requestCookies = parseRequestCookieHeader(request?.headers.get("cookie") ?? "");

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const storeCookies = cookieStore.getAll();
          if (storeCookies.length > 0) {
            return storeCookies;
          }
          return requestCookies;
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        }
      }
    }
  );
}
