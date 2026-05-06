import Link from "next/link";

import { LandingLogoHeader } from "@/components/landing-logo-header";

export default function HomePage() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-brand-cream px-4 py-10" dir="rtl">
      <div className="w-full max-w-md rounded-3xl bg-[#fdfbf8] p-10 shadow-soft ring-1 ring-navy-900/[0.06] md:max-w-lg md:p-12">
        <div className="flex flex-col items-center text-center">
          <LandingLogoHeader />

          <div className="mt-12 flex w-full flex-col items-center gap-5 px-1">
            <h1 className="text-balance text-3xl font-bold leading-snug tracking-tight text-navy-header md:text-4xl">
              anynanny - למצוא זמן לחיים
            </h1>
            <p className="max-w-sm text-pretty text-lg font-medium leading-relaxed text-navy-700 md:text-xl">
              מצאו את הבייביסיטר ותתחילו לחיות!
            </p>
          </div>

          <div className="mt-12 flex w-full max-w-md flex-col gap-4 sm:mx-auto sm:flex-row sm:justify-center">
            <Link
              href="/parent/dashboard"
              className="inline-flex min-h-[52px] min-w-0 flex-1 items-center justify-center rounded-2xl bg-brand-salmon px-7 py-4 text-center text-base font-bold text-white shadow-soft transition hover:brightness-[1.03] active:brightness-95 sm:flex-1 sm:basis-0"
            >
              כניסת הורים
            </Link>
            <Link
              href="/sitter/personal"
              className="inline-flex min-h-[52px] min-w-0 flex-1 items-center justify-center rounded-2xl bg-navy-header px-7 py-4 text-center text-base font-bold text-white shadow-soft transition hover:brightness-110 active:brightness-95 sm:flex-1 sm:basis-0"
            >
              כניסת בייביסיטר
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
