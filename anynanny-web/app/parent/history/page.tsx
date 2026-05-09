import Link from "next/link";

export default function ParentHistoryPage() {
  return (
    <main className="mx-auto w-full max-w-md space-y-4 py-2 text-right" dir="rtl">
      <h1 className="text-xl font-bold text-navy-header">היסטוריית שמרטפות</h1>
      <p className="text-sm text-slate-600">בקרוב — רשימת משמרות קודמות וסיכומים.</p>
      <Link href="/parent/dashboard" className="inline-block text-sm font-semibold text-navy-header underline">
        חזרה לדשבורד
      </Link>
    </main>
  );
}
