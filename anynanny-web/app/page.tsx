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
    <main className="flex min-h-[calc(100dvh-88px)] flex-col items-center justify-center px-4 py-3 sm:py-6" dir="rtl">
      <div className="flex w-full max-w-md flex-col items-center gap-3 text-center sm:gap-6">
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
          <Link
            href="/auth/login"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#001F3F] px-6 py-3 text-center text-base font-bold text-white shadow-soft transition hover:brightness-110 active:brightness-95 sm:min-h-14 sm:w-auto sm:min-w-[12rem] sm:px-8 sm:py-3.5"
          >
            התחברות
          </Link>
          <Link
            href="/auth/register"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#001F3F] px-6 py-3 text-center text-base font-bold text-white shadow-soft transition hover:brightness-110 active:brightness-95 sm:min-h-14 sm:w-auto sm:min-w-[12rem] sm:px-8 sm:py-3.5"
          >
            הרשמה
          </Link>
        </div>

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
