"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { setUserRoleChoice } from "@/lib/auth/returning-user";

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isManual = searchParams.get("manual") === "true";

  useEffect(() => {
    if (isManual) return;
    try {
      const activeRole = localStorage.getItem("active_role");
      if (activeRole === "parent") {
        router.replace("/parent/dashboard");
        return;
      }
      if (activeRole === "sitter") {
        router.replace("/sitter/dashboard");
      }
    } catch {
      /* ignore */
    }
  }, [isManual, router]);

  const navigateWithRole = (path: "/login" | "/signup", role: "parent" | "sitter") => {
    setUserRoleChoice(role);
    router.push(`${path}?role=${role}`);
  };

  const parentButtonClass =
    "inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#FF8A8A] px-3 py-3.5 text-center text-base font-bold text-white shadow-soft transition hover:brightness-[1.04] active:brightness-95 sm:min-h-14 sm:text-lg";
  const sitterButtonClass =
    "inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-navy-header px-3 py-3.5 text-center text-base font-bold text-white shadow-soft transition hover:brightness-110 active:brightness-95 sm:min-h-14 sm:text-lg";

  return (
    <main
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden overscroll-none"
      dir="rtl"
      suppressHydrationWarning
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-md flex-col items-center justify-center gap-3 px-1 py-2 text-center sm:gap-4 sm:py-3">
        <header className="flex shrink-0 flex-col items-center gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-navy-header sm:text-3xl">AnyNanny</h1>
          <p className="text-xs text-slate-600 sm:text-sm">למצוא זמן לחיים</p>
        </header>

        <div className="flex shrink-0 justify-center">
          <Image
            src="/logo_clean.png"
            alt="לוגו AnyNanny"
            width={280}
            height={280}
            className="mx-auto max-h-[22vh] w-auto max-w-[min(100%,168px)] object-contain sm:max-h-[26vh] sm:max-w-[200px]"
            style={{ borderRadius: "50%", overflow: "hidden" }}
            sizes="(max-width: 640px) 168px, 200px"
            priority
          />
        </div>

        {/* 👑 התיבה הלבנה המרכזית: כפתורי כניסת הורים ונניז זה לצד זה */}
        <div className="w-full shrink-0 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-soft sm:p-5">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            <button
              type="button"
              suppressHydrationWarning
              onClick={() => navigateWithRole("/login", "parent")}
              className={parentButtonClass}
            >
              כניסת הורים
            </button>
            <button
              type="button"
              suppressHydrationWarning
              onClick={() => navigateWithRole("/login", "sitter")}
              className={sitterButtonClass}
            >
              כניסת נני
            </button>
          </div>
        </div>

        {/* ✨ החלק התחתון: כפתור הרשמה נקי וממוקד המאפשר יצירת חשבון חדש */}
        <div className="mt-1 w-full max-w-xs shrink-0 px-4">
          <button
            type="button"
            onClick={() => {
              navigateWithRole("/signup", "parent");
            }}
            className="w-full rounded-xl border border-slate-300 bg-white/80 py-2.5 text-sm font-bold text-navy-header shadow-sm transition hover:bg-slate-50 active:scale-98"
          >
            הרשמה
          </button>
        </div>

        <p className="max-w-sm shrink-0 text-pretty text-xs leading-snug text-slate-500 sm:text-sm mt-2">
          מצאו את הבייביסיטר המתאים ותתחילו לחיות — הורים ובייביסיטרים במקום אחד.
        </p>
      </div>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main
          className="flex h-full min-h-0 w-full flex-col items-center justify-center overflow-hidden overscroll-none px-4 py-3"
          dir="rtl"
          suppressHydrationWarning
        >
          <div className="flex w-full max-w-md flex-col items-center gap-3">
            <div className="h-8 w-40 animate-pulse rounded-lg bg-slate-200" />
            <div className="h-32 w-32 animate-pulse rounded-full bg-slate-100 sm:h-36 sm:w-36" />
            <div className="h-44 w-full animate-pulse rounded-2xl bg-white/80 sm:h-48" />
            <p className="text-xs text-slate-500 sm:text-sm">טוען...</p>
          </div>
        </main>
      }
    >
      <HomeInner />
    </Suspense>
  );
}