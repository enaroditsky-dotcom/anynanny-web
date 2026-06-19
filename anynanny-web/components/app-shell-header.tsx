"use client";

import Link from "next/link";
import { Home } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";

export function AppShellHeader() {
  const pathname = usePathname();
  const { isLoading } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  /** מניעת הידרציה שגויה מול השרת */
  const showUi = mounted && !isLoading;

  return (
    <header className="w-full shrink-0 border-b border-navy-header/10 bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/80">
      <div className="flex h-20 items-center justify-between px-4" dir="rtl">
        
        {/* צד ימין - כפתור הבית */}
        <div className="flex w-16 justify-start">
          {showUi ? (
            <Link
              href="/"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-navy-header ring-1 ring-navy-header/15 transition hover:bg-slate-100"
              aria-label="דף הבית"
            >
              <Home className="h-5 w-5" strokeWidth={2} aria-hidden />
            </Link>
          ) : (
            <div className="h-10 w-10 animate-pulse rounded-full bg-slate-100" />
          )}
        </div>

        {/* מרכז - הלוגו הנקי והמותג המוגדל */}
        <div className="flex items-center gap-4">
          
          {/* עיגול נקי עם קו מסגרת בלבד - ללא שום עיוות דיגיטלי */}
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-navy-header/20 bg-white flex items-center justify-center shadow-sm">
            {/* שימוש ב-img רגיל עוקף את חסימת השרת ומציג את התמונה ישירות */}
            <img
              src="/anynanny-clean-transparent.png.jpg" 
              alt="AnyNanny Logo"
              className="h-full w-full object-contain p-1"
              onError={(e) => {
                // גיבוי למקרה שהשם אצלך במחשב הוא עם הסיומת השנייה
                (e.target as HTMLImageElement).src = "/anynanny_clean.jpg";
              }}
            />
          </div>

          {/* שם המותג המסוגנן X2 */}
          <span className="text-3xl font-black tracking-tight text-[#001F3F]">
            Any<span className="text-emerald-600">Nanny</span>
          </span>
        </div>

        {/* צד שמאל - ספייסר מאזן לשמירה על מרכזיות הלוגו */}
        <div className="w-16" aria-hidden />
        
      </div>
    </header>
  );
}