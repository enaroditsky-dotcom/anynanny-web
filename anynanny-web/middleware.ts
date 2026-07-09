import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseMiddlewareClient } from '@/lib/supabase/middleware-client';

export async function middleware(request: NextRequest) {
  // חיבור מאובטח דרך הפונקציה שתיקנו
  const { supabase, getResponse } = createSupabaseMiddlewareClient(request);
  
  // זה מבצע אימות סשן שמונע את שגיאת ה-500
  await supabase.auth.getSession();
  
  return getResponse();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};