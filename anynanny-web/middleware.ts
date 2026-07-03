import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ADMIN_AUTH_COOKIE } from "@/lib/admin/auth";
import { getRoleGateRedirect } from "@/lib/auth/post-auth-destination";
import {
  applySupabaseCookies,
  createSupabaseMiddlewareClient
} from "@/lib/supabase/middleware-client";

function isPublicAuthPath(pathname: string): boolean {
  return pathname.startsWith("/auth/");
}

function isProtectedAppPath(pathname: string): boolean {
  return (
    pathname.startsWith("/parent") ||
    pathname.startsWith("/sitter") ||
    pathname === "/session" ||
    pathname.startsWith("/session/")
  );
}

async function refreshSession(request: NextRequest): Promise<{
  response: NextResponse;
  user: { id: string } | null;
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { response: NextResponse.next({ request }), user: null };
  }

  const { supabase, getResponse } = createSupabaseMiddlewareClient(request);
  try {
    await supabase.auth.getSession();
    const { data: { user } } = await supabase.auth.getUser();
    return { response: getResponse(), user: user ? { id: user.id } : null };
  } catch {
    return { response: getResponse(), user: null };
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicAuthPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    const { response } = await refreshSession(request);
    return response;
  }

  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") {
      return NextResponse.next();
    }
    const hasAuthCookie = request.cookies.get(ADMIN_AUTH_COOKIE)?.value === "1";
    if (hasAuthCookie) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  if (!isProtectedAppPath(pathname)) {
    return NextResponse.next();
  }

  const { supabase, getResponse } = createSupabaseMiddlewareClient(request);
  const response = getResponse();

  try {
    // 1. ננסה למשוך את ה-Session והמשתמש
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    // 🛡️ טיפול בבג שמחקת את החשבון ב-Supabase לייב:
    if (sessionError || (session && !session.user)) {
      throw new Error("User missing from auth backend");
    }

    // אם אין סשן בכלל - זרוק ל-Login
    if (!session) {
      const login = new URL("/auth/login", request.url);
      login.searchParams.set("next", `${pathname}${search}`);
      return applySupabaseCookies(response, NextResponse.redirect(login));
    }

    return response;

  } catch (err) {
    console.error("🎯 זיהוי חשבון מחוק או טוקן שבור - מנקים סשן ומנתבים מחדש:", err);
    
    // החשבון נמחק מאחורי הקלעים! ננקה את הקוקיז ונעיף אותו בצורה חלקה לעמוד הבית או לעמוד שגיאה
    const target = new URL("/auth/login", request.url);
    target.searchParams.set("error", "account_deleted"); // נוסיף פרמטר קטן כדי שהיוזר יבין מה קרה
    
    const redirectResponse = NextResponse.redirect(target);
    
    // מאפסים את טוקני ה-Auth המקומיים כדי לעצור את הלולאה וההבהוב מיד
    redirectResponse.cookies.set("sb-access-token", "", { maxAge: 0 });
    redirectResponse.cookies.set("sb-refresh-token", "", { maxAge: 0 });
    
    return applySupabaseCookies(response, redirectResponse);
  }
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/auth",
    "/auth/:path*",
    "/parent",
    "/parent/:path*",
    "/session",
    "/session/:path*",
    "/sitter",
    "/sitter/:path*",
    "/api/:path*"
  ]
};