import Link from "next/link";

export default function SitterPersonalPage() {
  return (
    <main className="min-h-screen bg-surface p-6 md:p-10" dir="rtl">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="rounded-2xl bg-white p-5 shadow-soft">
          <h1 className="text-2xl font-semibold text-navy-900">אזור אישי</h1>
          <p className="mt-1 text-sm text-navy-700">מסך בית נקי: רק משמרת פעילה ובקשות חדשות.</p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-brand-mint bg-white p-4">
            <p className="text-xs text-navy-700">טיימר משמרת פעילה</p>
            <p className="mt-1 text-xl font-bold text-navy-900">אין משמרת פעילה כרגע</p>
            <Link href="/sitter/session" className="mt-3 inline-block rounded-lg bg-navy-900 px-3 py-2 text-sm text-white">מעבר למסך סשן</Link>
          </article>
          <article className="rounded-2xl border border-brand-mint bg-white p-4">
            <p className="text-xs text-navy-700">בקשות נכנסות</p>
            <p className="mt-1 text-xl font-bold text-navy-900">0 בקשות חדשות</p>
          </article>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-soft">
          <h2 className="text-lg font-semibold text-navy-900">כלי ניהול באזור אישי</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Link href="/sitter/calendar" className="rounded-lg border border-navy-300 px-3 py-1 text-navy-900">Calendar</Link>
            <button className="rounded-lg border border-navy-300 px-3 py-1 text-navy-900" type="button">Wallet (בקרוב)</button>
            <button className="rounded-lg border border-navy-300 px-3 py-1 text-navy-900" type="button">Stats (בקרוב)</button>
          </div>
        </section>
      </div>
    </main>
  );
}
