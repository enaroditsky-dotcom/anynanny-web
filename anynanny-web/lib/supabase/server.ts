import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import { safeParseSupabaseCookieJson } from "@/lib/supabase/cookie-value";

export { decodeSupabaseCookieValue, safeParseSupabaseCookieJson } from "@/lib/supabase/cookie-value";

export async function createServerClient() {
  // בדיקה אם הקוד רץ בדפדפן - אם כן, נמנע מייבוא קוקיז של שרת שיגרמו לקריסה
  if (typeof window !== "undefined") {
    return null;
  }

  // ייבוא דינמי של הקוקיז רק כאשר אנחנו בטוחים ב-100% שאנחנו על השרת
  const { cookies } = require("next/headers");
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
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // נעטוף ב-catch למקרה שהקריאה מתבצעת מתוך Server Component שלא מאפשר מוטציה
          }
        },
      },
    }
  );
}

/** Alias used by API routes (`await createSupabaseServerClient()`). */
export { createServerClient as createSupabaseServerClient };

/**
 * Split a raw `Cookie` header into name/value pairs.
 * Values are left as stored (may still be `base64-...`); use
 * {@link safeParseSupabaseCookieJson} / {@link decodeSupabaseCookieValue} before JSON use.
 */
export function parseRequestCookieHeader(header: string): { name: string; value: string }[] {
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

/**
 * Parse a Cookie header and safely JSON-decode any Supabase auth cookie values
 * (`base64-...` or plain JSON). Invalid entries become `null` instead of throwing.
 */
export function parseRequestCookiesWithSafeJson(
  header: string
): { name: string; value: string; json: unknown | null }[] {
  return parseRequestCookieHeader(header).map(({ name, value }) => ({
    name,
    value,
    json: safeParseSupabaseCookieJson(value)
  }));
}
