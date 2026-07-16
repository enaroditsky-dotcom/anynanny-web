import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  // יצירת Response חדש כדי שנוכל להעביר עוגיות מעודכנות מהשרת לדפדפן
  const res = NextResponse.next();
  
  // שימוש במימוש הרשמי של Supabase שמטפל בעוגיות בצורה בטוחה
  const supabase = createMiddlewareClient({ req, res });

  // בדיקת סשן - הפונקציה הזו יודעת להתמודד עם עוגיות בצורה פנימית בלי לזרוק שגיאות
  await supabase.auth.getSession();

  // החזרת ה-Response עם העוגיות המעודכנות (במידת הצורך)
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};