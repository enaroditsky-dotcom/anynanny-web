import Link from "next/link";

export default function ParentCalendarPage() {
  return (
    <main className="mx-auto w-full max-w-md space-y-4 py-2" dir="rtl">
      <h1 className="text-center text-xl font-bold text-navy-header">יומן</h1>
      <p className="text-center text-sm text-slate-600">בקרוב — תצוגת פגישות וזמינות.</p>
      <Link href="/parent/dashboard" className="block text-center text-sm font-semibold text-navy-header underline">
        חזרה לדשבורד
      </Link>
    </main>
  );
}
