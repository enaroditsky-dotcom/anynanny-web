import Link from "next/link";

import { LandingLogoHeader } from "@/components/landing-logo-header";

export default function HomePage() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-brand-cream px-4 py-10" dir="rtl">
      <div className="w-full max-w-md rounded-3xl bg-[#fdfbf8] p-8 shadow-soft ring-1 ring-navy-900/[0.06] md:max-w-lg md:p-10">
        <div className="flex flex-col items-center gap-6 text-center">
          <LandingLogoHeader />

          <h1 className="text-balance text-3xl font-bold leading-snug tracking-tight text-navy-900 md:text-4xl">
            anynanny - למצוא זמן לחיים
          </h1>

          <p className="max-w-sm text-pretty text-lg font-medium leading-relaxed text-navy-700 md:text-xl">
            מצאו את הבייביסיטר ותתחילו לחיות!
          </p>

          <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center sm:gap-4">
            <Link
              href="/parent/dashboard"
              className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl bg-brand-salmon px-6 py-3 text-center text-base font-semibold text-white shadow-soft transition hover:brightness-[1.03] active:brightness-95 sm:flex-none sm:min-w-[160px]"
            >
              כניסת הורים
            </Link>
            <Link
              href="/sitter/personal"
              className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border border-navy-900/35 bg-transparent px-6 py-3 text-center text-base font-semibold text-navy-900 transition hover:bg-navy-900/[0.06] active:bg-navy-900/[0.1] sm:flex-none sm:min-w-[160px]"
            >
              כניסת בייביסיטר
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
