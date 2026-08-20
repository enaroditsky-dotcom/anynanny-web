import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware-client";
import { shouldForwardRootAuthCallback } from "@/lib/auth/password-reset";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Explicit recovery that fell back to Site URL arrives as `/?type=recovery`.
  // Generic signup `/?code=` is not recovery and must not be forwarded here.
  if (shouldForwardRootAuthCallback(pathname, searchParams)) {
    const dest = req.nextUrl.clone();
    dest.pathname = "/auth/reset-password";
    return NextResponse.redirect(dest);
  }

  try {
    // `@supabase/ssr` correctly decodes `base64-...` auth cookies (auth-helpers does not).
    const { supabase, getResponse } = createSupabaseMiddlewareClient(req);
    await supabase.auth.getUser();
    return getResponse();
  } catch {
    // Ignore corrupt/legacy token noise on public pages; continue the request.
    return NextResponse.next({ request: { headers: req.headers } });
  }
}

export const config = {
  // מוציא את כל נתיבי ה־auth וקבצים סטטיים מהבדיקה הקפדנית של ה־Middleware
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js|auth/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};