import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_AUTH_COOKIE } from "@/lib/admin/auth";
import { isProfileRole, type ProfileRole } from "@/lib/supabase/profiles";

function supabaseProjectRefFromUrl(supabaseUrl: string): string | null {
  try {
    const host = new URL(supabaseUrl).hostname;
    const m = host.match(/^([^.]+)\.supabase\.co$/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * When getUser() returns null (cookie chunking / edge timing), still detect likely auth cookies
 * so we avoid redirect loops — the client will validate with getSession().
 */
function hasSupabaseAuthCookie(request: NextRequest, projectRef: string | null): boolean {
  const cookies = request.cookies.getAll();
  for (const c of cookies) {
    if (!c.value) continue;
    if (c.name === "supabase-auth-token") return true;
    if (projectRef && (c.name === `sb-${projectRef}-auth-token` || c.name.startsWith(`sb-${projectRef}-auth-token.`))) {
      return true;
    }
    if (c.name.startsWith("sb-") && c.name.includes("auth-token")) return true;
  }
  return false;
}

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
    (nextParam === "/session" ||
      nextParam.startsWith("/session/") ||
      nextParam === "/sitter" ||
      nextParam.startsWith("/sitter/")) &&
    !nextParam.includes("..") &&
    !nextParam.startsWith("//");
  return ok ? nextParam : "/sitter/dashboard";
}

function middlewareRedirect(request: NextRequest, destination: string): NextResponse {
  return NextResponse.redirect(new URL(destination, request.url));
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
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const isAuthPath = pathname === "/auth" || pathname.startsWith("/auth/");
  const isProtectedApp =
    pathname.startsWith("/parent") ||
    pathname === "/session" ||
    pathname.startsWith("/session/") ||
    pathname === "/sitter" ||
    pathname.startsWith("/sitter/");

  if (!isAuthPath && !isProtectedApp) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.warn("[middleware] Supabase env missing — skipping auth gate.");
    return NextResponse.next();
  }

  const projectRef = supabaseProjectRefFromUrl(url);
  const cookieLikelySession = hasSupabaseAuthCookie(request, projectRef);

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
    data: { user },
    error: authError
  } = await supabase.auth.getUser();
  if (authError) {
    console.warn("[middleware] getUser:", authError.message);
  }

  const trustClientSession =
    pathname === "/parent/dashboard" ||
    pathname === "/sitter/dashboard" ||
    (pathname.startsWith("/parent") && cookieLikelySession) ||
    (pathname.startsWith("/sitter") && cookieLikelySession);

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

  if (isAuthPath) {
    return response;
  }

  /** Let the dashboard (and other /parent routes when auth cookies exist) load — client verifies session. */
  if (!user && isProtectedApp && trustClientSession) {
    return response;
  }

  if (!user && isProtectedApp) {
    const authUrl = new URL("/auth", request.url);
    authUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(authUrl);
  }

  if (!user) {
    return response;
  }

  const role = await roleForUser(supabase, user);

  if (!role) {
    const authUrl = new URL("/auth", request.url);
    authUrl.searchParams.set("error", "no_profile");
    return NextResponse.redirect(authUrl);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/auth", "/auth/:path*", "/parent/:path*", "/session", "/session/:path*", "/sitter", "/sitter/:path*"]
};
