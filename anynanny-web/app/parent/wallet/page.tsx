import Link from "next/link";
import { ArrowRight, CreditCard, Plus } from "lucide-react";

export default function ParentWalletPage() {
  return (
    <main className="mx-auto w-full max-w-md space-y-5 py-2" dir="rtl">
      <div className="flex items-center justify-between">
        <Link
          href="/parent/dashboard"
          className="inline-flex items-center gap-1 rounded-full border border-navy-header/20 bg-white px-3 py-1.5 text-xs font-semibold text-navy-header shadow-sm transition hover:bg-brand-cream"
        >
          <ArrowRight className="h-4 w-4" />
          חזרה לדשבורד
        </Link>
        <h1 className="text-lg font-bold text-navy-header">הארנק שלי</h1>
      </div>

      <section className="rounded-3xl bg-[#001F3F] p-5 text-white shadow-soft">
        <p className="text-sm text-white/80">היתרה שלך</p>
        <p className="mt-2 text-4xl font-bold tracking-tight">₪0.00</p>
        <p className="mt-1 text-xs text-white/75">ניתן להשתמש ביתרה לתשלום משמרות עתידיות.</p>
      </section>

      <section className="space-y-3">
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FF8A8A] px-4 py-3 text-sm font-bold text-white shadow-soft transition hover:brightness-105 active:brightness-95"
        >
          <Plus className="h-4 w-4" />
          הטען כסף לארנק
        </button>
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-navy-header/25 bg-white px-4 py-3 text-sm font-semibold text-navy-header shadow-sm transition hover:bg-brand-cream"
        >
          <CreditCard className="h-4 w-4" />
          ניהול אמצעי תשלום
        </button>
      </section>

      <section className="rounded-3xl bg-white p-4 shadow-soft">
        <h2 className="text-base font-bold text-navy-header">פעולות אחרונות</h2>
        <div className="mt-3 space-y-2">
          <div className="rounded-xl border border-navy-header/10 bg-[#F8FAFC] p-3">
            <p className="text-sm font-semibold text-navy-900">אין פעולות להצגה עדיין</p>
            <p className="mt-1 text-xs text-navy-700">כאשר תבצעי תשלום לבייביסיטר, הפעולה תופיע כאן.</p>
          </div>
          <div className="rounded-xl border border-dashed border-navy-header/20 p-3 text-xs text-navy-600">תשלום למשמרת — יופיע בהמשך</div>
          <div className="rounded-xl border border-dashed border-navy-header/20 p-3 text-xs text-navy-600">טעינת ארנק — יופיע בהמשך</div>
        </div>
      </section>
    </main>
  );
}
