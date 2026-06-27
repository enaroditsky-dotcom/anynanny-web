"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { setUserRoleChoice } from "@/lib/auth/returning-user";

type HomeTab = "login" | "signup";

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isManual = searchParams.get("manual") === "true";
  const [activeTab, setActiveTab] = useState<HomeTab>("login");

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
    "inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#FF8A8A] px-5 py-3.5 text-center text-base font-bold text-white shadow-soft transition hover:brightness-[1.04] active:brightness-95 sm:min-h-14 sm:text-lg";
  const sitterButtonClass =
    "inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-navy-header px-5 py-3.5 text-center text-base font-bold text-white shadow-soft transition hover:brightness-110 active:brightness-95 sm:min-h-14 sm:text-lg";

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

        <div className="w-full shrink-0 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-soft sm:p-5">
          <div
            role="tablist"
            aria-label="התחברות או הרשמה"
            className="mb-4 flex w-full rounded-xl bg-slate-100 p-1 sm:mb-5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "login"}
              suppressHydrationWarning
              onClick={() => setActiveTab("login")}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition sm:py-2.5 sm:text-base ${
                activeTab === "login"
                  ? "bg-white text-navy-header shadow-sm"
                  : "text-slate-600 hover:text-navy-header"
              }`}
            >
              התחברות
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "signup"}
              suppressHydrationWarning
              onClick={() => setActiveTab("signup")}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition sm:py-2.5 sm:text-base ${
                activeTab === "signup"
                  ? "bg-white text-navy-header shadow-sm"
                  : "text-slate-600 hover:text-navy-header"
              }`}
            >
              הרשמה
            </button>
          </div>

          <div
            role="tabpanel"
            className="flex w-full flex-col gap-2.5 sm:gap-3"
            aria-label={activeTab === "login" ? "התחברות" : "הרשמה"}
          >
            {activeTab === "login" ? (
              <>
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
                  כניסת בייביסיטר
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  suppressHydrationWarning
                  onClick={() => navigateWithRole("/signup", "parent")}
                  className={parentButtonClass}
                >
                  הרשמה כהורה
                </button>
                <button
                  type="button"
                  suppressHydrationWarning
                  onClick={() => navigateWithRole("/signup", "sitter")}
                  className={sitterButtonClass}
                >
                  הרשמה כבייביסיטר
                </button>
              </>
            )}
          </div>
        </div>

        <p className="max-w-sm shrink-0 text-pretty text-xs leading-snug text-slate-600 sm:text-sm">
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
