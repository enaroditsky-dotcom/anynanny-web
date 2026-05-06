import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex h-screen min-h-[100dvh] items-center justify-center bg-brand-cream" dir="rtl">
      <div className="flex flex-col items-center gap-6 px-6">
        <div className="relative h-36 w-36 shrink-0 overflow-hidden rounded-full shadow-soft ring-2 ring-white/80 sm:h-44 sm:w-44 md:h-52 md:w-52">
          <Image
            src="/logo_header.png"
            alt="AnyNanny"
            fill
            className="object-cover object-center"
            sizes="(max-width: 640px) 144px, (max-width: 768px) 176px, 208px"
            priority
          />
        </div>
        <h1 className="max-w-md text-center text-3xl font-semibold tracking-tight text-navy-900 md:text-4xl">
          anynanny - למצוא זמן לחיים
        </h1>
        <Link
          href="/parent/dashboard"
          className="rounded-2xl bg-brand-salmon px-8 py-4 text-center text-lg font-semibold text-white shadow-soft transition hover:brightness-105 active:brightness-95 md:px-10 md:py-5 md:text-xl"
        >
          מצאו את הבייביסיטר ותתחילו לחיות!
        </Link>
      </div>
    </main>
  );
}
