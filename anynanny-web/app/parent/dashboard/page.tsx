"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  buildDashboardGreetingTitle,
  useDashboardGreetingName
} from "@/lib/user/use-dashboard-greeting-name";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";

export default function ParentDashboardPage() {
  const router = useRouter();
  const [parentUserId, setParentUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const { firstName, nameLoading } = useDashboardGreetingName("parent", parentUserId);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const auth = await resolveBrowserAuth();
      if (cancelled) return;

      if (!auth.ok) {
        router.replace("/auth/login?next=/parent/dashboard");
        return;
      }

      setParentUserId(auth.userId);
      try {
        localStorage.setItem("active_role", "parent");
      } catch {
        /* ignore */
      }
      setAuthReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const greeting = buildDashboardGreetingTitle(firstName, nameLoading);

  if (!authReady) {
    return (
      <main
        className="mx-auto flex h-full min-h-0 w-full max-w-md flex-col items-center justify-center bg-[#FDFBF6] px-4 py-8"
        dir="rtl"
      >
        <p className="text-sm font-medium text-slate-500">טוען...</p>
      </main>
    );
  }

  return (
    <main
      className="mx-auto flex h-full min-h-0 w-full max-w-md flex-col gap-6 bg-[#FDFBF6] px-4 py-6"
      dir="rtl"
    >
      <header className="text-right">
        <h1
          className={`text-2xl font-bold leading-tight text-[#001F3F] sm:text-3xl ${nameLoading ? "animate-pulse" : ""}`}
        >
          {greeting}
        </h1>
      </header>

      <section className="shrink-0">
        <button
          type="button"
          onClick={() => router.push("/parent/onboarding")}
          className="flex w-full min-h-[3.5rem] items-center justify-center rounded-2xl bg-navy-header px-5 py-4 text-base font-bold text-white shadow-soft transition hover:brightness-110 active:scale-[0.99]"
        >
          התחלת שאלון התאמה
        </button>
      </section>

      <section
        className="flex min-h-0 flex-1 flex-col gap-4"
        aria-label="תוכן דשבורד"
      >
        {/* Reserved for future dashboard cards and data */}
      </section>
    </main>
  );
}
