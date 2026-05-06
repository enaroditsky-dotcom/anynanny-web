import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#FDFBF7] px-4 py-10" dir="rtl">
      <div className="w-full max-w-md rounded-[2rem] bg-[#fdfbf8] p-10 shadow-soft ring-1 ring-navy-header/[0.06] md:max-w-lg md:p-12">
        <div className="flex flex-col items-center text-center">
          <p className="text-2xl font-bold tracking-tight text-navy-header md:text-[1.65rem]">AnyNanny</p>

          <div className="mt-8">
            <div className="rounded-full bg-gradient-to-b from-brand-mint to-brand-peach p-[3px] shadow-soft">
              <div className="relative mx-auto aspect-square w-[min(72vw,220px)] overflow-hidden rounded-full bg-white sm:w-56 md:w-[232px]">
                <Image
                  src="/landing-hero.png"
                  alt=""
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 640px) 220px, 232px"
                  priority
                />
              </div>
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

          <div className="mt-12 flex w-full flex-wrap justify-center gap-4 px-1">
            <Link
              href="/parent/dashboard"
              className="inline-flex h-[52px] min-h-[52px] min-w-[min(100%,11rem)] flex-1 basis-[11rem] items-center justify-center rounded-full bg-brand-salmon px-8 text-center text-base font-bold text-white shadow-soft ring-1 ring-brand-salmon/30 transition hover:brightness-[1.04] active:brightness-95 sm:max-w-[13rem]"
            >
              כניסת הורים
            </Link>
            <Link
              href="/sitter/personal"
              className="inline-flex h-[52px] min-h-[52px] min-w-[min(100%,11rem)] flex-1 basis-[11rem] items-center justify-center rounded-full border-2 border-navy-header bg-transparent px-8 text-center text-base font-bold text-navy-header transition hover:bg-navy-header/[0.06] active:bg-navy-header/[0.1] sm:max-w-[13rem]"
            >
              כניסת בייביסיטר
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
