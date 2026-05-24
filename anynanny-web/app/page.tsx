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

  const goToRoleDashboard = (role: "parent" | "sitter") => {
    setUserRoleChoice(role);
    try {
      localStorage.setItem("active_role", role);
    } catch {
      /* ignore */
    }
    router.push(role === "parent" ? "/parent/dashboard" : "/sitter/dashboard");
  };

  return (
    <main
      className="flex min-h-[calc(100dvh-88px)] w-full min-w-0 flex-col items-center justify-center px-4 py-3 sm:py-6"
      dir="rtl"
      suppressHydrationWarning
    >
      <div className="flex w-full min-w-0 max-w-md flex-col items-center gap-3 text-center sm:gap-6">
        <h1 className="text-3xl font-bold tracking-tight text-navy-header sm:text-4xl md:text-5xl">AnyNanny</h1>

        <div className="flex w-full justify-center">
          <Image
            src="/logo_clean.png"
            alt="AnyNanny logo"
            width={510}
            height={510}
            className="mx-auto max-h-[24vh] w-auto max-w-[min(100%,220px)] object-contain object-center sm:max-h-[36vh] sm:max-w-[min(100%,280px)] md:max-h-[48vh] md:max-w-full"
            style={{ borderRadius: "50%", overflow: "hidden" }}
            sizes="(max-width: 640px) 220px, (max-width: 768px) 280px, 480px"
            priority
          />
        </div>

        <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:justify-center sm:gap-4">
          <button
            type="button"
            suppressHydrationWarning
            onClick={() => goToRoleDashboard("parent")}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#FF8A8A] px-6 py-3 text-center text-base font-bold text-white shadow-soft transition hover:brightness-[1.04] active:brightness-95 sm:min-h-14 sm:w-auto sm:min-w-[12rem] sm:px-8 sm:py-3.5"
          >
            כניסת הורים
          </button>
          <button
            type="button"
            suppressHydrationWarning
            onClick={() => goToRoleDashboard("sitter")}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#001F3F] px-6 py-3 text-center text-base font-bold text-white shadow-soft transition hover:brightness-110 active:brightness-95 sm:min-h-14 sm:w-auto sm:min-w-[12rem] sm:px-8 sm:py-3.5"
          >
            כניסת בייביסיטר
          </button>
        </div>

        <p className="text-center text-xs text-slate-500">
          פעם ראשונה? אחרי הכניסה ניתן לבחור גם{" "}
          <button
            type="button"
            suppressHydrationWarning
            className="font-semibold text-navy-header underline"
            onClick={() => router.push("/auth/register")}
          >
            הרשמה
          </button>
        </p>

        <div className="flex w-full flex-col items-center gap-1.5 px-1 pt-1 sm:gap-3 sm:pt-2">
          <p className="text-balance text-lg font-bold leading-tight tracking-tight text-navy-header sm:text-2xl md:text-3xl">
            anynanny - למצוא זמן לחיים
          </p>
          <p className="max-w-sm text-pretty text-sm font-normal leading-snug text-navy-header sm:text-lg md:text-xl">
            מצאו את הבייביסיטר ותתחילו לחיות!
          </p>
        </div>
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
          <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row sm:justify-center">
            <div className="h-12 flex-1 animate-pulse rounded-2xl bg-rose-100" />
            <div className="h-12 flex-1 animate-pulse rounded-2xl bg-slate-200" />
          </div>
          <p className="text-sm text-slate-500">טוען...</p>
        </main>
      }
    >
      <HomeInner />
    </Suspense>
  );
}
