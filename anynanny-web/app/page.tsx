"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Baby, ChevronDown, ChevronUp, Users } from "lucide-react";
import { setUserRoleChoice } from "@/lib/auth/returning-user";

type LandingPath = "parent" | "sitter";

function PathIcon({ path }: { path: LandingPath }) {
  if (path === "parent") {
    return <Users className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />;
  }

  return <Baby className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />;
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
    accent:
      "border-[#FF8A8A]/35 bg-[#FF8A8A]/10 text-[#C45C5C]",
    iconWrap:
      "bg-[#FF8A8A]/15 text-[#FF8A8A] ring-[#FF8A8A]/25"
  },
  {
    id: "sitter",
    title: "בייביסיטר",
    subtitle: "קבלת משמרות ועבודה",
    accent:
      "border-navy-header/20 bg-[#001F3F]/5 text-navy-header",
    iconWrap:
      "bg-[#001F3F]/10 text-navy-header ring-navy-header/15"
  }
];

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isManual = searchParams.get("manual") === "true";
  const [registrationOpen, setRegistrationOpen] = useState(false);

  useEffect(() => {
    // בדיקת שגיאות גם ב-Query וגם ב-Hash של Supabase
    const hash = window.location.hash;
    const search = window.location.search;

    if (hash.includes("error") || search.includes("error")) {
      const queryString = search
        ? search
        : `?${hash.replace("#", "")}`;

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

  const navigateWithPath = (
    action: "login" | "register",
    path: LandingPath
  ) => {
    const profileRole = path === "parent" ? "parent" : "sitter";

    setUserRoleChoice(profileRole);

    try {
      localStorage.setItem(
        "anynanny_service_track",
        path === "sitter" ? "babysitter" : "parent"
      );
    } catch {
      /* ignore */
    }

    const qs = new URLSearchParams({
      role: profileRole,
      track: "babysitter"
    });

    router.push(`/${action}?${qs.toString()}`);
  };

  return (
    <main
      className="min-h-[100dvh] w-full overflow-y-auto bg-[#FDFBF6] px-4 py-3 sm:py-5"
      dir="rtl"
    >
      <div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col items-center justify-center gap-3 sm:min-h-[calc(100dvh-2.5rem)] sm:gap-4">
        {/* Brand */}
        <div className="shrink-0 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-navy-header sm:text-4xl">
            AnyNanny
          </h1>

          <p className="mt-0.5 text-xs font-medium text-slate-500 sm:text-sm">
            למצוא זמן לחיים
          </p>
        </div>

        {/* Anny */}
        <div className="flex shrink-0 justify-center">
          <div className="relative flex h-[clamp(120px,20dvh,170px)] w-[clamp(120px,20dvh,170px)] shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-navy-header/20 bg-white shadow-md sm:h-[180px] sm:w-[180px]">
            <img
              src="/anynanny-clean-transparent.png.jpg"
              alt="AnyNanny"
              className="h-full w-full object-contain p-2"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  "/anynanny_clean.jpg";
              }}
            />
          </div>
        </div>

        {/* Login */}
        <section className="w-full shrink-0 rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-soft sm:p-4">
          <h2 className="text-center text-xl font-extrabold tracking-tight text-navy-header sm:text-2xl">
            כניסה
          </h2>

          <div className="mt-2 grid grid-cols-2 gap-2">
            {PATHS.map((path) => (
              <button
                key={`login-${path.id}`}
                type="button"
                onClick={() =>
                  navigateWithPath("login", path.id)
                }
                className={`flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center transition hover:brightness-[0.99] active:scale-[0.98] sm:min-h-[92px] sm:rounded-2xl ${path.accent}`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 sm:h-10 sm:w-10 ${path.iconWrap}`}
                >
                  <PathIcon path={path.id} />
                </span>

                <span className="block text-sm font-bold leading-tight sm:text-[15px]">
                  כניסת {path.title}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Register */}
        <section className="w-full shrink-0 px-1 pt-1 sm:px-1.5 sm:pt-1.5">
          <button
            type="button"
            onClick={() => setRegistrationOpen((open) => !open)}
            aria-expanded={registrationOpen}
            aria-controls="landing-registration-options"
            className="mx-auto flex w-full items-center justify-center gap-1 text-navy-header transition hover:opacity-80"
          >
            <span className="text-sm font-extrabold">הרשמה</span>
            {registrationOpen ? (
              <ChevronUp className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
            )}
          </button>

          <p className="mt-0.5 text-center text-[10px] leading-snug text-slate-500 sm:text-[11px]">
            עדיין אין לכם חשבון? צרו את החשבון המתאים לכם
          </p>

          <div
            id="landing-registration-options"
            className={`grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out ${
              registrationOpen
                ? "mt-2 grid-rows-[1fr] opacity-100"
                : "mt-0 grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="grid grid-cols-2 gap-2">
                {PATHS.map((path) => (
                  <button
                    key={`register-${path.id}`}
                    type="button"
                    onClick={() =>
                      navigateWithPath("register", path.id)
                    }
                    className={`flex min-h-[70px] flex-col items-center justify-center gap-1 rounded-xl border bg-white px-2 py-2.5 text-center shadow-sm transition hover:bg-slate-50 active:scale-[0.98] sm:min-h-[78px] sm:rounded-2xl ${path.accent}`}
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 sm:h-9 sm:w-9 ${path.iconWrap}`}
                    >
                      <PathIcon path={path.id} />
                    </span>

                    <span className="min-w-0">
                      <span className="block text-xs font-bold leading-tight sm:text-sm">
                        {path.title}
                      </span>

                      <span className="block text-[10px] font-medium leading-snug opacity-75 sm:text-xs">
                        הרשמה
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <p className="max-w-sm shrink-0 text-center text-[10px] leading-snug text-slate-500 sm:text-xs">
          הורים ובייביסיטריות — כל הקהילה במקום אחד.
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
          className="flex min-h-[100dvh] items-center justify-center bg-[#FDFBF6]"
          dir="rtl"
        >
          <p className="text-sm text-slate-500">טוען...</p>
        </main>
      }
    >
      <HomeInner />
    </Suspense>
  );
}