import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
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

function middlewareRedirect(request: NextRequest, destination: string): NextResponse {
  const nextUrl = new URL(destination, request.url);
  console.log("Middleware: Redirecting to...", nextUrl.toString());
  return NextResponse.redirect(nextUrl);
}

async function roleForUser(supabase: SupabaseClient, user: User): Promise<ProfileRole | null> {
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();

  let role = profile?.role;
  if (!isProfileRole(role)) {
    const meta = user.user_metadata?.role;
    role = typeof meta === "string" && isProfileRole(meta) ? meta : undefined;
  }

  return isProfileRole(role) ? role : null;
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
    console.log("Middleware: Redirecting to...", loginUrl.toString());
    return NextResponse.redirect(loginUrl);
  }

  const isAuthPath = pathname === "/auth" || pathname.startsWith("/auth/");
  const isProtectedApp =
    pathname.startsWith("/parent") || pathname === "/session" || pathname.startsWith("/session/");

  if (!isAuthPath && !isProtectedApp) {
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

  /**
   * Prefer getUser() over getSession() — validates JWT with Supabase Auth server (recommended for middleware).
   */
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();
  if (authError) {
    console.warn("[middleware] getUser:", authError.message);
  }

  /** Signed-in user opened /auth — send them to the app (middleware owns this redirect). */
  if (isAuthPath && user) {
    const role = await roleForUser(supabase, user);
    if (!role) {
      return response;
    }

    const nextParam = request.nextUrl.searchParams.get("next");
    const destPath = destinationForRole(role, nextParam);

    if (pathname === destPath || pathname.startsWith(`${destPath}/`)) {
      return response;
    }

    return middlewareRedirect(request, destPath);
  }

  /** Guests on /auth — render login/register. */
  if (isAuthPath) {
    return response;
  }

  /** Protected routes without a valid user → login. */
  if (!user) {
    const authUrl = new URL("/auth", request.url);
    authUrl.searchParams.set("next", pathname);
    console.log("Middleware: Redirecting to...", authUrl.toString());
    return NextResponse.redirect(authUrl);
  }

  const role = await roleForUser(supabase, user);

  if (!role) {
    const authUrl = new URL("/auth", request.url);
    authUrl.searchParams.set("error", "no_profile");
    console.log("Middleware: Redirecting to...", authUrl.toString());
    return NextResponse.redirect(authUrl);
  }

  const wantsParent = pathname.startsWith("/parent");
  const wantsSitter = pathname === "/session" || pathname.startsWith("/session/");

  if (wantsParent && role !== "parent") {
    return middlewareRedirect(request, "/session");
  }
  if (wantsSitter && role !== "sitter") {
    return middlewareRedirect(request, "/parent/dashboard");
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/auth", "/auth/:path*", "/parent/:path*", "/session", "/session/:path*"]
};
