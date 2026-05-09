import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_AUTH_COOKIE } from "@/lib/admin/auth";
import { isProfileRole } from "@/lib/supabase/profiles";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") {
      return NextResponse.next();
    }
    const hasAuthCookie = request.cookies.get(ADMIN_AUTH_COOKIE)?.value === "1";
    if (hasAuthCookie) {
      return NextResponse.next();
    }
    const loginUrl = new URL("/admin/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  const needsRoleGate =
    pathname.startsWith("/parent") || pathname === "/session" || pathname.startsWith("/session/");

  if (!needsRoleGate) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.warn("[middleware] Supabase env missing — auth routes are not gated.");
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request
  });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request
        });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    const authUrl = new URL("/auth", request.url);
    authUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(authUrl);
  }

  const { data: profile, error: profileErr } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();

  if (profileErr) {
    console.warn("[middleware] profiles:", profileErr.message);
  }

  let role = profile?.role;
  if (!isProfileRole(role)) {
    const meta = user.user_metadata?.role;
    role = typeof meta === "string" && isProfileRole(meta) ? meta : undefined;
  }

  if (!isProfileRole(role)) {
    const authUrl = new URL("/auth", request.url);
    authUrl.searchParams.set("error", "no_profile");
    return NextResponse.redirect(authUrl);
  }

  const wantsParent = pathname.startsWith("/parent");
  const wantsSitter = pathname === "/session" || pathname.startsWith("/session/");

  if (wantsParent && role !== "parent") {
    return NextResponse.redirect(new URL("/session", request.url));
  }
  if (wantsSitter && role !== "sitter") {
    return NextResponse.redirect(new URL("/parent/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/parent/:path*", "/session", "/session/:path*"]
};
