import Image from "next/image";
import Link from "next/link";

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-cream to-brand-peach/30 p-6 md:p-10" dir="rtl">
      <div className="mx-auto grid max-w-5xl items-center gap-6 md:grid-cols-2">
        <section className="rounded-3xl bg-white p-8 shadow-soft">
          <h1 className="mb-3 text-3xl font-bold text-navy-900">ברוכים הבאים ל-ANYNANNY</h1>
          <p className="text-sm text-navy-700">מסכי כניסה ולנדינג משתמשים בשפת האיור המרגיעה של המותג.</p>
          <div className="mt-6 space-y-3">
            <Link className="block rounded-xl bg-navy-900 px-4 py-2 text-center text-sm font-semibold text-white" href="/parent/dashboard">כניסה כהורה</Link>
            <Link className="block rounded-xl border border-navy-300 px-4 py-2 text-center text-sm font-semibold text-navy-900" href="/sitter/personal">כניסה כבייביסיטר</Link>
          </div>
        </section>
        <section className="rounded-3xl bg-white p-4 shadow-soft">
          <Image src="/grand-design-vision.png" alt="Calm sitter artwork" width={700} height={900} className="mx-auto h-auto w-full max-w-sm rounded-2xl" priority />
        </section>
      </div>
    </main>
  );
}
