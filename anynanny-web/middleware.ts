import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ADMIN_AUTH_COOKIE } from "@/lib/admin/auth";

function supabaseProjectRefFromUrl(supabaseUrl: string): string | null {
  try {
    const host = new URL(supabaseUrl).hostname;
    const m = host.match(/^([^.]+)\.supabase\.co$/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function hasSupabaseAuthCookie(request: NextRequest, projectRef: string | null): boolean {
  const cookies = request.cookies.getAll();
  for (const c of cookies) {
    if (!c.value) continue;
    if (c.name === "supabase-auth-token") return true;
    if (c.name === "sb-access-token") return true;
    if (c.name.includes("access-token")) return true;
    if (
      projectRef &&
      (c.name === `sb-${projectRef}-auth-token` || c.name.startsWith(`sb-${projectRef}-auth-token.`))
    ) {
      return true;
    }
    if (c.name.startsWith("sb-") && c.name.includes("auth-token")) return true;
  }
  return false;
}

function middlewareRedirect(request: NextRequest, destination: string): NextResponse {
  return NextResponse.redirect(new URL(destination, request.url));
}

// TEMP disabled with post-auth redirect block — restore when re-enabling `resolvePostAuthPath` in middleware.
// /** Current URL is allowed for the computed post-auth destination (avoids redirect loops). */
// function pathAllowedForPostAuthDest(pathname: string, dest: string): boolean {
//   const d = dest.split("?")[0];
//   if (d === "/auth/role-selection") return pathname === d || pathname.startsWith(`${d}/`);
//   if (d === "/parent/onboarding") return pathname === d || pathname.startsWith(`${d}/`);
//   if (d === "/sitter/onboarding") return pathname === d || pathname.startsWith(`${d}/`);
//   if (d === "/parent/dashboard") return pathname.startsWith("/parent");
//   if (d === "/sitter/dashboard") return pathname.startsWith("/sitter") || pathname.startsWith("/session");
//   if (d === "/auth") return pathname === "/auth";
//   if (d.startsWith("/auth")) return pathname === d || pathname.startsWith(`${d}/`);
//   return pathname === d || pathname.startsWith(`${d}/`);
// }

function isPublicRoute(pathname: string): boolean {
  if (pathname === "/auth/register" || pathname.startsWith("/auth/register/")) {
    return true;
  }
  /** Avoid post-login flicker: server `getUser()` can lag cookies for one request; page confirms session on client. */
  if (pathname === "/auth/role-selection" || pathname.startsWith("/auth/role-selection/")) {
    return true;
  }
  return false;
}

async function supabaseSessionRefreshResponse(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
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
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  await supabase.auth.getUser();
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    return supabaseSessionRefreshResponse(request);
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
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  /**
   * Authenticated users on `/sitter/*` must never be redirected to `/auth/role-selection` (sitter loop break).
   * When post-auth redirects are re-enabled below, this early return still applies first.
   */
  if (user && pathname.startsWith("/sitter")) {
    return response;
  }

  /**
   * Trust `/sitter/dashboard` (and legacy `/sitter/onboarding` URL) during cookie lag so SSR does not bounce to `/auth`.
   */
  const trustClientSession =
    pathname === "/parent/dashboard" ||
    pathname === "/parent/onboarding" ||
    pathname === "/sitter/dashboard" ||
    pathname.startsWith("/sitter/onboarding") ||
    (pathname.startsWith("/parent") && cookieLikelySession) ||
    (pathname.startsWith("/sitter") && cookieLikelySession);

  /**
   * TEMP (בטל): post-auth / `/auth/role-selection` redirects — was causing sitter redirect loops.
   * Re-enable by restoring `resolvePostAuthPath` + `pathAllowedForPostAuthDest` block below.
   */
  if (user && (isAuthPath || isProtectedApp)) {
    return response;
  }
  // if (user && (isAuthPath || isProtectedApp)) {
  //   const dest = await resolvePostAuthPath(supabase, user.id, request.nextUrl.searchParams.get("next"), {
  //     userEmail: user.email
  //   });
  //   const destBase = dest.split("?")[0];
  //   if (
  //     pathname.startsWith("/sitter") &&
  //     (destBase === "/auth/role-selection" || destBase.startsWith("/auth/role-selection/"))
  //   ) {
  //     return response;
  //   }
  //   if (!pathAllowedForPostAuthDest(pathname, dest)) {
  //     return middlewareRedirect(request, dest);
  //   }
  //   return response;
  // }

  if (isAuthPath) {
    return response;
  }

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

  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/auth",
    "/auth/:path*",
    "/parent/:path*",
    "/session",
    "/session/:path*",
    "/sitter",
    "/sitter/:path*",
    "/api/:path*"
  ]
};
