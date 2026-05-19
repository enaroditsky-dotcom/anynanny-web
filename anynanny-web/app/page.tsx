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
    "inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#FF8A8A] px-6 py-4 text-center text-lg font-bold text-white shadow-soft transition hover:brightness-[1.04] active:brightness-95";
  const sitterButtonClass =
    "inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-navy-header px-6 py-4 text-center text-lg font-bold text-white shadow-soft transition hover:brightness-110 active:brightness-95";

  return (
    <main
      className="flex min-h-[calc(100dvh-88px)] w-full min-w-0 flex-col items-center justify-center px-4 py-6"
      dir="rtl"
      suppressHydrationWarning
    >
      <div className="flex w-full min-w-0 max-w-md flex-col items-center gap-6 text-center">
        <header className="flex flex-col items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-navy-header sm:text-4xl">AnyNanny</h1>
          <p className="text-sm text-slate-600 sm:text-base">למצוא זמן לחיים</p>
        </header>

        <div className="flex w-full justify-center">
          <Image
            src="/logo_clean.png"
            alt="לוגו AnyNanny"
            width={280}
            height={280}
            className="mx-auto max-h-[28vh] w-auto max-w-[min(100%,200px)] object-contain sm:max-h-[32vh] sm:max-w-[240px]"
            style={{ borderRadius: "50%", overflow: "hidden" }}
            sizes="(max-width: 640px) 200px, 240px"
            priority
          />
        </div>

        <div className="w-full rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-soft sm:p-6">
          <div
            role="tablist"
            aria-label="התחברות או הרשמה"
            className="mb-6 flex w-full rounded-xl bg-slate-100 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "login"}
              suppressHydrationWarning
              onClick={() => setActiveTab("login")}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition sm:text-base ${
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
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition sm:text-base ${
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
            className="flex w-full flex-col gap-3"
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

        <p className="max-w-sm text-pretty text-sm leading-relaxed text-slate-600">
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
          className="flex min-h-[calc(100dvh-88px)] w-full flex-col items-center justify-center gap-4 px-4 py-6"
          dir="rtl"
          suppressHydrationWarning
        >
          <div className="h-8 w-40 animate-pulse rounded-lg bg-slate-200" />
          <div className="h-36 w-36 animate-pulse rounded-full bg-slate-100" />
          <div className="h-48 w-full max-w-md animate-pulse rounded-2xl bg-white/80" />
          <p className="text-sm text-slate-500">טוען...</p>
        </main>
      }
    >
      <HomeInner />
    </Suspense>
  );
}
