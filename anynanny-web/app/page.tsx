import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-cream to-brand-mint/40 p-6 md:p-10" dir="rtl">
      <div className="mx-auto grid max-w-6xl items-center gap-6 md:grid-cols-2">
        <section className="rounded-3xl bg-white p-7 shadow-soft">
          <p className="mb-2 text-sm text-navy-700">ANYNANNY</p>
          <h1 className="mb-3 text-3xl font-bold text-navy-900">אמון, רוגע ובטיחות בכל שמרטפות</h1>
          <p className="mb-6 text-sm text-navy-800">ממשק פתיחה בסגנון Calm Sitter, ואחריו סביבת עבודה יעילה ומהירה.</p>
          <div className="flex flex-wrap gap-3">
            <Link className="rounded-xl bg-navy-900 px-4 py-2 text-sm font-semibold text-white" href="/parent/dashboard">כניסת הורים</Link>
            <Link className="rounded-xl border border-navy-300 px-4 py-2 text-sm font-semibold text-navy-900" href="/sitter/personal">כניסת בייביסיטר</Link>
          </div>
        </section>
        <section className="flex flex-col items-center justify-center rounded-3xl bg-white p-6 shadow-soft md:p-8">
          <div className="relative mx-auto h-44 w-44 shrink-0 overflow-hidden rounded-full shadow-soft md:h-56 md:w-56 lg:h-64 lg:w-64">
            <Image
              src="/logo.png"
              alt="AnyNanny"
              fill
              className="object-cover object-center"
              sizes="(max-width: 768px) 176px, (max-width: 1024px) 224px, 256px"
              priority
            />
          </div>
        </section>
      </div>
    </main>
  );
}
