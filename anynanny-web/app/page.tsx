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
    <main className="flex min-h-[calc(100dvh-88px)] flex-col items-center justify-center px-4 py-6" dir="rtl">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-navy-header md:text-5xl">AnyNanny</h1>

        <div className="flex w-full justify-center">
          <Image
            src="/logo_clean.png"
            alt="AnyNanny logo"
            width={510}
            height={510}
            className="mx-auto max-h-[55vh] w-auto max-w-full object-contain object-center"
            style={{ borderRadius: "50%", overflow: "hidden" }}
            sizes="(max-width: 768px) 85vw, 480px"
            priority
          />
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center sm:gap-4">
          <Link
            href="/auth/login"
            className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#001F3F] px-8 py-3.5 text-center text-base font-bold text-white shadow-soft transition hover:brightness-110 active:brightness-95 sm:w-auto sm:min-w-[12rem]"
          >
            התחברות
          </Link>
          <Link
            href="/auth/register"
            className="inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#001F3F] px-8 py-3.5 text-center text-base font-bold text-white shadow-soft transition hover:brightness-110 active:brightness-95 sm:w-auto sm:min-w-[12rem]"
          >
            הרשמה
          </Link>
        </div>

        <div className="flex w-full flex-col items-center gap-3 px-1 pt-2">
          <p className="text-balance text-2xl font-bold leading-snug tracking-tight text-navy-header md:text-3xl">
            anynanny - למצוא זמן לחיים
          </p>
          <p className="max-w-sm text-pretty text-lg font-normal leading-relaxed text-navy-header md:text-xl">
            מצאו את הבייביסיטר ותתחילו לחיות!
          </p>
        </div>
      </div>
    </main>
  );
}
