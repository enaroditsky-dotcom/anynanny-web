"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SitterProfileForm } from "@/components/sitter/sitter-profile-form";
import { SitterBankDetailsSection } from "@/components/sitter/SitterBankDetailsSection";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SitterPersonalPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) setAuthReady(true);
        return;
      }

      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        router.replace("/auth/login?next=/sitter/personal");
        return;
      }

      setUserId(user.id);
      setAuthReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-md flex-col space-y-4 bg-[#FDFBF6] py-2 pb-8" dir="rtl">
      <header className="text-right">
        <h1 className="text-xl font-bold text-[#001F3F]">הגדרות חשבון</h1>
        <p className="mt-1 text-sm text-slate-600">ניהול הפרופיל והעדפות האישיות.</p>
      </header>

      <section className="rounded-2xl border border-navy-header/10 bg-white p-4 shadow-soft">
        <h2 className="text-right text-sm font-bold text-navy-header">קיצורי דרך</h2>
        <div className="mt-3 flex flex-wrap justify-end gap-2 text-sm">
          <Link
            href="/sitter/profile"
            className="rounded-lg border border-navy-header/15 bg-[#FDFBF6] px-3 py-1.5 font-semibold text-navy-header transition hover:bg-white"
          >
            פרופיל מקצועי
          </Link>
          <Link
            href="/sitter/dashboard"
            className="rounded-lg border border-navy-header/15 bg-[#FDFBF6] px-3 py-1.5 font-semibold text-navy-header transition hover:bg-white"
          >
            דשבורד
          </Link>
          <Link
            href="/sitter/availability"
            className="rounded-lg border border-navy-header/15 bg-[#FDFBF6] px-3 py-1.5 font-semibold text-navy-header transition hover:bg-white"
          >
            סידור עבודה
          </Link>
          <Link
            href="/sitter/shifts"
            className="rounded-lg border border-navy-header/15 bg-[#FDFBF6] px-3 py-1.5 font-semibold text-navy-header transition hover:bg-white"
          >
            המשמרות שלי
          </Link>
          <Link
            href="/sitter/wallet"
            className="rounded-lg border border-navy-header/15 bg-[#FDFBF6] px-3 py-1.5 font-semibold text-navy-header transition hover:bg-white"
          >
            ארנק
          </Link>
        </div>
      </section>

      {authReady && userId ? <SitterBankDetailsSection sitterId={userId} /> : null}

      {authReady ? <SitterProfileForm userId={userId} className="mt-1" /> : null}
    </main>
  );
}
