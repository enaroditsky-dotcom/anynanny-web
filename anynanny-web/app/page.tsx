"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export default function HomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isManual = searchParams.get("manual") === "true";

  useEffect(() => {
    if (isManual) return;
    const activeRole = localStorage.getItem("active_role");
    if (activeRole === "parent") {
      router.replace("/parent/dashboard");
      return;
    }
    if (activeRole === "sitter") {
      router.replace("/session");
    }
  }, [isManual, router]);

  return (
    <main className="flex min-h-[calc(100dvh-88px)] items-center justify-center py-4" dir="rtl">
      <div className="w-full text-center">
        <div className="flex flex-col items-center text-center">
          <h1 className="text-5xl font-bold tracking-tight text-navy-header">AnyNanny</h1>
          <div className="mt-2">
            <div className="relative mx-auto h-[510px] w-[510px] max-w-full">
              <Image
                src="/logo_clean.png"
                alt="AnyNanny logo"
                width={510}
                height={510}
                className="h-full w-full object-contain object-center"
                style={{ borderRadius: "50%", overflow: "hidden" }}
                sizes="510px"
                priority
              />
            </div>
          </div>

          <div className="mt-10 flex w-full flex-col items-center gap-4 px-1">
            <h1 className="text-balance text-2xl font-bold leading-snug tracking-tight text-navy-header md:text-3xl">
              anynanny - למצוא זמן לחיים
            </h1>
            <p className="max-w-sm text-pretty text-lg font-normal leading-relaxed text-navy-header md:text-xl">
              מצאו את הבייביסיטר ותתחילו לחיות!
            </p>
          </div>

          <div className="mt-12 flex w-full justify-center gap-4 px-1">
            <Link
              href="/parent/dashboard"
              className="inline-flex h-14 w-[11.5rem] items-center justify-center rounded-full bg-[#FF8A8A] px-6 text-center text-base font-bold text-white shadow-soft transition hover:brightness-[1.04] active:brightness-95"
            >
              כניסת הורים
            </Link>
            <Link
              href="/session"
              className="inline-flex h-14 w-[11.5rem] items-center justify-center rounded-full bg-[#001F3F] px-6 text-center text-base font-bold text-white shadow-soft transition hover:brightness-110 active:brightness-95"
            >
              כניסת בייביסיטר
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
