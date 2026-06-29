import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";

export function createServerClient() {
  // בדיקה אם הקוד רץ בדפדפן - אם כן, נמנע מייבוא קוקיז של שרת שיגרמו לקריסה
  if (typeof window !== "undefined") {
    return null;
  }

  // ייבוא דינמי של הקוקיז רק כאשר אנחנו בטוחים ב-100% שאנחנו על השרת
  const { cookies } = require("next/headers");
  const cookieStore = cookies();

  return createSupabaseServerClient(
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

export function parseRequestCookieHeader(header: string): { name: string; value: string }[] {
  if (!header || !header.trim()) return [];
  return header.split(";").map((c) => {
    const [name, ...valueParts] = c.split("=");
    return { name: name.trim(), value: valueParts.join("=").trim() };
  });
}