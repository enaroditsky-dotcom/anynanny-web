import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ADMIN_AUTH_COOKIE } from "@/lib/admin/auth";
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
  // 🛡️ מחסום כניסה גלובלי - חוסם את כל האתר לכולם
  if (process.env.NODE_ENV === 'production') {
    const basicAuth = request.headers.get('authorization');
    if (!basicAuth || basicAuth !== `Basic ${Buffer.from('admin:anynanny2026').toString('base64')}`) {
      return new NextResponse('Auth Required', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Secure Area"' },
      });
    }
  }

  const { pathname, search } = request.nextUrl;

  if (isPublicAuthPath(pathname)) return NextResponse.next();

  if (pathname.startsWith("/api")) {
    const { response } = await refreshSession(request);
    return response;
  }

  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") return NextResponse.next();
    const hasAuthCookie = request.cookies.get(ADMIN_AUTH_COOKIE)?.value === "1";
    if (hasAuthCookie) return NextResponse.next();
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  if (!isProtectedAppPath(pathname)) return NextResponse.next();

  const { supabase, getResponse } = createSupabaseMiddlewareClient(request);
  const response = getResponse();

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || (session && !session.user)) throw new Error("User missing");

    if (!session) {
      const login = new URL("/auth/login", request.url);
      login.searchParams.set("next", `${pathname}${search}`);
      return applySupabaseCookies(response, NextResponse.redirect(login));
    }

    // 🛡️ לוגיקת אכיפת תפקידים ו-Onboarding
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, onboarding_completed_at")
      .eq("id", session.user.id)
      .single();

    if (profile) {
      // 1. אכיפת Onboarding
      if (!profile.onboarding_completed_at) {
        if (profile.role === 'parent' && !pathname.startsWith('/parent/onboarding')) {
          return NextResponse.redirect(new URL("/parent/onboarding", request.url));
        }
        if (profile.role === 'sitter' && !pathname.startsWith('/sitter/onboarding')) {
          return NextResponse.redirect(new URL("/sitter/onboarding", request.url));
        }
      }

      // 2. אכיפת הפרדה בין הורה לנני
      if (profile.role === 'parent' && pathname.startsWith('/sitter')) {
        return NextResponse.redirect(new URL("/parent/dashboard", request.url));
      }
      if (profile.role === 'sitter' && pathname.startsWith('/parent')) {
        return NextResponse.redirect(new URL("/sitter/dashboard", request.url));
      }
    }

    return response;

  } catch (err) {
    console.error("🎯 Middleware error:", err);
    const target = new URL("/auth/login", request.url);
    const redirectResponse = NextResponse.redirect(target);
    redirectResponse.cookies.set("sb-access-token", "", { maxAge: 0 });
    redirectResponse.cookies.set("sb-refresh-token", "", { maxAge: 0 });
    return applySupabaseCookies(response, redirectResponse);
  }
}

export const config = {
  matcher: ["/admin/:path*", "/auth", "/auth/:path*", "/parent/:path*", "/session/:path*", "/sitter/:path*", "/api/:path*"]
};