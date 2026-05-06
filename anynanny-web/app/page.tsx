import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-brand-cream px-4 py-10" dir="rtl">
      <div className="w-full max-w-md rounded-3xl bg-[#fdfbf8] p-8 shadow-soft ring-1 ring-navy-900/[0.06] md:max-w-lg md:p-10">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="relative mx-auto h-36 w-44 shrink-0 sm:h-40 sm:w-48 md:h-44 md:w-52">
            <Image
              src="/logo_header.png"
              alt="AnyNanny"
              fill
              className="object-contain object-center"
              sizes="(max-width: 768px) 192px, 208px"
              priority
            />
          </div>

          <h1 className="text-balance text-2xl font-bold leading-snug text-navy-900 md:text-3xl">
            anynanny - למצוא זמן לחיים
          </h1>

          <p className="max-w-sm text-pretty text-base font-medium text-navy-700 md:text-lg">
            מצאו את הבייביסיטר ותתחילו לחיות!
          </p>

          <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center sm:gap-4">
            <Link
              href="/parent/dashboard"
              className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl bg-brand-salmon px-6 py-3 text-center text-base font-semibold text-white shadow-soft transition hover:brightness-105 active:brightness-95 sm:flex-none sm:min-w-[160px]"
            >
              כניסת הורים
            </Link>
            <Link
              href="/sitter/personal"
              className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border-2 border-navy-900 bg-transparent px-6 py-3 text-center text-base font-semibold text-navy-900 transition hover:bg-navy-900/[0.04] active:bg-navy-900/[0.08] sm:flex-none sm:min-w-[160px]"
            >
              כניסת בייביסיטר
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
