import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function createSupabaseMiddlewareClient(request: NextRequest) {
  const supabaseUrl = "https://dqycvddpdhxawdgdatfe.supabase.co";
  // וודא שזה ה-anon key שהעתקת מה-Legacy (הארוך שמתחיל ב-eyJ)
  const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxeWN2ZGRwZGh4YXdkZ2RhdGZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDMzNTEsImV4cCI6MjA5MzgxOTM1MX0.1nIMudhzgs1j41tzA4VhtEQjdIhztFWMmDoFU1G69-I";

  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  return { supabase, getResponse: () => response };
}