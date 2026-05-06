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
        <section className="rounded-3xl bg-white p-4 shadow-soft">
          <Image src="/grand-design-vision.png" alt="Grand design vision" width={700} height={900} className="mx-auto h-auto w-full max-w-sm rounded-2xl" priority />
        </section>
      </div>
    </main>
  );
}
