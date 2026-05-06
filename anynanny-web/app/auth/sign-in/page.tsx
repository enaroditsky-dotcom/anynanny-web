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
