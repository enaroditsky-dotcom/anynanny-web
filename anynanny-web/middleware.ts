import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware-client";
import { shouldForwardRootAuthCallback } from "@/lib/auth/root-auth-callback";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => cookie.name.includes("-auth-token"));
}

function logMiddleware(step: string, pathname: string) {
  console.info("[middleware]", step, pathname);
}

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  logMiddleware("enter", pathname);

  // Explicit recovery that fell back to Site URL arrives as `/?type=recovery`.
  // Generic signup `/?code=` is not recovery and must not be forwarded here.
  if (shouldForwardRootAuthCallback(pathname, searchParams)) {
    logMiddleware("redirect-recovery", pathname);
    const dest = req.nextUrl.clone();
    dest.pathname = "/auth/reset-password";
    return NextResponse.redirect(dest);
  }

  if (!hasSupabaseAuthCookie(req)) {
    logMiddleware("next-anonymous", pathname);
    return NextResponse.next({ request: { headers: req.headers } });
  }

  try {
    // `@supabase/ssr` correctly decodes `base64-...` auth cookies (auth-helpers does not).
    // getUser() refreshes session cookies for Server Components. Do not remove it
    // after the supabase-js deadlock fix; the result itself is unused here.
    const { supabase, getResponse } = createSupabaseMiddlewareClient(req);
    logMiddleware("before-getUser", pathname);
    await supabase.auth.getUser();
    logMiddleware("after-getUser", pathname);
    return getResponse();
  } catch {
    // Ignore corrupt/legacy token noise on public pages; continue the request.
    logMiddleware("catch-next", pathname);
    return NextResponse.next({ request: { headers: req.headers } });
  }
}

export const config = {
  matcher: [
    "/((?!_next/|favicon.ico|sw\\.js|auth/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"
  ]
};
