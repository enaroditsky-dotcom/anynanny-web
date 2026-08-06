"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Baby, Users } from "lucide-react";
import { setUserRoleChoice } from "@/lib/auth/returning-user";

type LandingPath = "parent" | "sitter";

function PathIcon({ path }: { path: LandingPath }) {
  if (path === "parent") return <Users className="h-6 w-6 stroke-[1.75]" aria-hidden />;
  return <Baby className="h-6 w-6 stroke-[1.75]" aria-hidden />;
}

const PATHS: Array<{
  id: LandingPath;
  title: string;
  subtitle: string;
  accent: string;
  iconWrap: string;
}> = [
  {
    id: "parent",
    title: "הורים",
    subtitle: "חיפוש בייביסיטר",
    accent: "border-[#FF8A8A]/35 bg-[#FF8A8A]/10 text-[#C45C5C]",
    iconWrap: "bg-[#FF8A8A]/15 text-[#FF8A8A] ring-[#FF8A8A]/25"
  },
  {
    id: "sitter",
    title: "בייביסיטר",
    subtitle: "קבלת משמרות ועבודה",
    accent: "border-navy-header/20 bg-[#001F3F]/5 text-navy-header",
    iconWrap: "bg-[#001F3F]/10 text-navy-header ring-navy-header/15"
  }
];

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isManual = searchParams.get("manual") === "true";

  useEffect(() => {
    // בדיקת שגיאות גם ב-Query (סימן שאלה) וגם ב-Hash (סימן סולם של Supabase)
    const hash = window.location.hash;
    const search = window.location.search;
    
    if (hash.includes('error') || search.includes('error')) {
      const queryString = search ? search : `?${hash.replace('#', '')}`;
      router.replace(`/auth/verified${queryString}`);
      return;
    }

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
  }, [isManual, router, searchParams]);

  const navigateWithPath = (action: "login" | "register", path: LandingPath) => {
    const profileRole = path === "parent" ? "parent" : "sitter";
    setUserRoleChoice(profileRole);
    try {
      localStorage.setItem("anynanny_service_track", path === "sitter" ? "babysitter" : "parent");
    } catch {
      /* ignore */
    }
    const qs = new URLSearchParams({ role: profileRole, track: "babysitter" });
    router.push(`/${action}?${qs.toString()}`);
  };

  return (
    <main
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden overscroll-none"
      dir="rtl"
      suppressHydrationWarning
    >
      <div className="mx-auto flex h-full w-full max-w-md flex-col items-center justify-between gap-2 px-3 py-2.5 text-center sm:justify-center sm:gap-4 sm:py-5">
        <header className="flex shrink-0 flex-col items-center gap-0.5 sm:gap-1.5">
          <h1 className="text-3xl font-black tracking-tight text-navy-header sm:text-5xl">AnyNanny</h1>
          <p className="text-xs font-medium text-slate-600 sm:text-base">למצוא זמן לחיים</p>
        </header>

        <div className="flex shrink-0 justify-center">
          <div className="relative flex h-[min(28vh,200px)] w-[min(28vh,200px)] shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-navy-header/20 bg-white shadow-md sm:h-[240px] sm:w-[240px]">
            <img
              src="/anynanny-clean-transparent.png.jpg"
              alt="לוגו AnyNanny"
              className="h-full w-full object-contain p-2 sm:p-3"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/anynanny_clean.jpg";
              }}
            />
          </div>
        </div>

        <section className="w-full shrink-0 rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-soft sm:rounded-3xl sm:p-5">
          <h2 className="text-xl font-extrabold tracking-tight text-navy-header sm:text-3xl">כניסה</h2>
          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:mt-4">
            {PATHS.map((path) => (
              <button
                key={`login-${path.id}`}
                type="button"
                onClick={() => navigateWithPath("login", path.id)}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition hover:brightness-[0.99] active:scale-[0.98] sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-4 ${path.accent}`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 sm:h-10 sm:w-10 sm:rounded-xl ${path.iconWrap}`}
                >
                  <PathIcon path={path.id} />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold leading-tight sm:text-sm">
                    כניסת {path.title}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="w-full shrink-0 rounded-2xl border border-dashed border-slate-300/90 bg-[#FDFBF6]/90 p-3 shadow-sm sm:rounded-3xl sm:p-5">
          <h2 className="text-sm font-extrabold text-navy-header">הרשמה</h2>
          <p className="mt-0.5 text-[10px] leading-snug text-slate-500 sm:text-[11px]">
            עדיין אין לכם חשבון? צרו את החשבון המתאים לכם
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3">
            {PATHS.map((path) => (
              <button
                key={`register-${path.id}`}
                type="button"
                onClick={() => navigateWithPath("register", path.id)}
                className={`flex flex-col items-center gap-1 rounded-xl border bg-white px-2 py-3 text-center shadow-sm transition hover:bg-slate-50 active:scale-[0.98] sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-4 ${path.accent}`}
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 sm:h-10 sm:w-10 sm:rounded-xl ${path.iconWrap}`}
                >
                  <PathIcon path={path.id} />
                </span>
                <span className="min-w-0 space-y-0.5">
                  <span className="block text-xs font-bold leading-tight sm:text-sm">{path.title}</span>
                  <span className="block text-[10px] font-medium leading-snug opacity-75 sm:text-xs">
                    הרשמה
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <p className="max-w-sm shrink-0 text-pretty text-[10px] leading-snug text-slate-500 sm:text-sm">
          הורים ובייביסיטריות — כל הקהילה במקום אחד.
        </p>
      </div>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">טוען...</div>}>
      <HomeInner />
    </Suspense>
  );
}