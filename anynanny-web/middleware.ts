import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ADMIN_AUTH_COOKIE } from "@/lib/admin/auth";
import { getRoleGateRedirect } from "@/lib/auth/post-auth-destination";
import {
  applySupabaseCookies,
  createSupabaseMiddlewareClient
} from "@/lib/supabase/middleware-client";

function isPublicAuthPath(pathname: string): boolean {
  if (pathname === "/auth/register" || pathname.startsWith("/auth/register/")) return true;
  if (pathname === "/auth/role-selection" || pathname.startsWith("/auth/role-selection/")) return true;
  return false;
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
  await supabase.auth.getSession();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return { response: getResponse(), user: user ? { id: user.id } : null };
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

  const isAuth = pathname === "/auth" || pathname.startsWith("/auth/");
  if (isAuth) {
    const { response } = await refreshSession(request);
    return response;
  }

  if (!isProtectedAppPath(pathname)) {
    return NextResponse.next();
  }

  const { supabase, getResponse } = createSupabaseMiddlewareClient(request);
  await supabase.auth.getSession();
  const {
    data: { user: authUser }
  } = await supabase.auth.getUser();
  const response = getResponse();

  if (authUser) {
    const gate = await getRoleGateRedirect(
      supabase,
      authUser.id,
      pathname,
      authUser.email ?? null
    );
    if (gate) {
      const roleSelection = new URL(gate, request.url);
      const redirect = NextResponse.redirect(roleSelection);
      return applySupabaseCookies(response, redirect);
    }
    return response;
  }

  const login = new URL("/auth/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  const redirect = NextResponse.redirect(login);
  return applySupabaseCookies(response, redirect);
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
