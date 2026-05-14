import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";

export default function ParentMessagesPage() {
  return (
    <main className="mx-auto w-full max-w-md space-y-4 bg-[#FDFBF6] py-2" dir="rtl">
      <div className="flex items-center justify-between">
        <Link
          href="/parent/dashboard"
          className="inline-flex items-center gap-1 rounded-full border border-navy-header/20 bg-white px-3 py-1.5 text-xs font-semibold text-navy-header shadow-sm transition hover:bg-brand-cream"
        >
          <ArrowRight className="h-4 w-4" />
          חזרה לדשבורד
        </Link>
        <h1 className="text-lg font-bold text-navy-header">הודעות</h1>
      </div>

      <section className="rounded-2xl border border-navy-header/10 bg-white p-6 text-center shadow-sm">
        <MessageCircle className="mx-auto h-8 w-8 text-navy-header" strokeWidth={1.75} />
        <p className="mt-3 text-base font-semibold text-navy-900">תיבת הודעות תעלה בקרוב</p>
        <p className="mt-1 text-sm text-navy-700">כאן יופיעו שיחות עם בייביסיטרים ועדכוני משמרת.</p>
      </section>
    </main>
  );
}
