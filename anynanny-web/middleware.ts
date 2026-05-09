import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_AUTH_COOKIE } from "@/lib/admin/auth";
import { isProfileRole, type ProfileRole } from "@/lib/supabase/profiles";

function destinationForRole(role: ProfileRole, nextParam: string | null): string {
  if (role === "parent") {
    const ok =
      nextParam &&
      nextParam.startsWith("/parent") &&
      !nextParam.includes("..") &&
      !nextParam.startsWith("//");
    return ok ? nextParam : "/parent/dashboard";
  }
  const ok =
    nextParam &&
    (nextParam === "/session" || nextParam.startsWith("/session/")) &&
    !nextParam.includes("..") &&
    !nextParam.startsWith("//");
  return ok ? nextParam : "/session";
}

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

  const isAuthPath = pathname === "/auth" || pathname.startsWith("/auth/");
  const isParentPath = pathname.startsWith("/parent");
  const isSessionPath = pathname === "/session" || pathname.startsWith("/session/");

  if (!isAuthPath && !isParentPath && !isSessionPath) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.warn("[middleware] Supabase env missing — skipping auth gate.");
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

  /** Logged-in users must not stay on auth screens — single server redirect (no client loop). */
  if (isAuthPath && user) {
    const { data: profile, error: profileErr } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profileErr) {
      console.warn("[middleware] profiles:", profileErr.message);
    }

    let role = profile?.role;
    if (!isProfileRole(role)) {
      const meta = user.user_metadata?.role;
      role = typeof meta === "string" && isProfileRole(meta) ? meta : undefined;
    }

    /** Stay on /auth and show error — redirecting to /auth again would loop. */
    if (!isProfileRole(role)) {
      return response;
    }

    const nextParam = request.nextUrl.searchParams.get("next");
    const destPath = destinationForRole(role, nextParam);

    if (pathname === destPath || pathname.startsWith(`${destPath}/`)) {
      return response;
    }

    return NextResponse.redirect(new URL(destPath, request.url));
  }

  /** Auth pages for guests — no redirect. */
  if (isAuthPath) {
    return response;
  }

  /** Protected app routes require a session. */
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

/** Only app routes — not `/_next/*`, `/favicon.ico`, or root assets like `/logo.png`. */
export const config = {
  matcher: ["/admin/:path*", "/auth", "/auth/:path*", "/parent/:path*", "/session", "/session/:path*"]
};
