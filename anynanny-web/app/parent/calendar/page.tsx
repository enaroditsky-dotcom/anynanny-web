"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

export default function ParentCalendarPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setReady(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData.user;
        if (!user) {
          if (!cancelled) router.replace("/auth/login?next=/parent/calendar");
          return;
        }

        const { data: profile, error } = await supabase
          .from(PROFILES_TABLE)
          .select("id, role, full_name")
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          console.warn("[parent/calendar] profile load:", error.message);
        }

        if (!cancelled && profile?.role && profile.role !== "parent") {
          router.replace("/parent/dashboard");
          return;
        }

        if (!cancelled) setReady(true);
      } catch (e) {
        console.warn("[parent/calendar] bootstrap failed:", e);
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <main className="mx-auto w-full max-w-md space-y-4 py-2" dir="rtl">
        <p className="text-center text-sm text-slate-600">טוען...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md space-y-4 py-2" dir="rtl">
      <h1 className="text-center text-xl font-bold text-navy-header">יומן</h1>
      <p className="text-center text-sm text-slate-600">בקרוב — תצוגת פגישות וזמינות.</p>
      <Link href="/parent/dashboard" className="block text-center text-sm font-semibold text-navy-header underline">
        חזרה לדשבורד
      </Link>
    </main>
  );
}
