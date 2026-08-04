import { createSupabaseMiddlewareClient } from "@/lib/supabase/middleware-client";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
