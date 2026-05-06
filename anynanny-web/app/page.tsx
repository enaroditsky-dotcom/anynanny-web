import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-surface p-6 md:p-10" dir="rtl">
      <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2">
        <section className="rounded-2xl bg-navy-900 p-6 text-white md:p-8">
          <p className="mb-2 text-sm text-blue-100">מסלול הורה</p>
          <h1 className="mb-3 text-2xl font-semibold">אני הורה</h1>
          <p className="mb-6 text-sm text-blue-100">ניהול הזמנות, יומן חכם ופילטרים מתקדמים.</p>
          <div className="flex flex-wrap gap-3">
            <Link className="inline-block rounded-xl bg-white px-4 py-2 text-sm font-medium text-navy-900" href="/parent/dashboard">
              כניסה כהורה
            </Link>
            <Link
              className="inline-block rounded-xl border border-blue-200 px-4 py-2 text-sm font-medium text-blue-50 hover:bg-white/10"
              href="/parent/sitter/demo-sitter-1/calendar"
            >
              צפייה ביומן סיטר
            </Link>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 text-navy-900 shadow-sm md:p-8">
          <p className="mb-2 text-sm text-navy-700">מסלול סיטר</p>
          <h2 className="mb-3 text-2xl font-semibold">אני סיטר/ית</h2>
          <p className="mb-6 text-sm text-navy-700">ניהול פרופיל, מגדר, תעריף לשעה וזמינות ביומן.</p>
          <div className="flex flex-wrap gap-3">
            <Link className="rounded-xl bg-navy-800 px-4 py-2 text-sm font-medium text-white" href="/auth/sign-up">
              פתיחת פרופיל סיטר
            </Link>
            <Link className="rounded-xl border border-navy-700 px-4 py-2 text-sm font-medium text-navy-700" href="/verification">
              אימות
            </Link>
            <Link className="rounded-xl border border-navy-700 px-4 py-2 text-sm font-medium text-navy-700" href="/sitter/calendar">
              יומן זמינות
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
