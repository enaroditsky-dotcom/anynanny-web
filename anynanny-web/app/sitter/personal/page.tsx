import Link from "next/link";
import { DeleteAccountSection } from "@/components/account/delete-account-section";

export default function SitterPersonalPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-md flex-col bg-[#FDFBF6] py-2 pb-8" dir="rtl">
      <header className="text-right">
        <h1 className="text-xl font-bold text-[#001F3F]">הגדרות חשבון</h1>
        <p className="mt-1 text-sm text-slate-600">ניהול הפרופיל והעדפות האישיות.</p>
      </header>

      <section className="mt-4 rounded-2xl border border-navy-header/10 bg-white p-4 shadow-soft">
        <h2 className="text-right text-sm font-bold text-navy-header">קיצורי דרך</h2>
        <div className="mt-3 flex flex-wrap justify-end gap-2 text-sm">
          <Link
            href="/sitter/dashboard"
            className="rounded-lg border border-navy-header/15 bg-[#FDFBF6] px-3 py-1.5 font-semibold text-navy-header transition hover:bg-white"
          >
            דשבורד
          </Link>
          <Link
            href="/sitter/calendar"
            className="rounded-lg border border-navy-header/15 bg-[#FDFBF6] px-3 py-1.5 font-semibold text-navy-header transition hover:bg-white"
          >
            יומן
          </Link>
        </div>
      </section>

      <div className="mt-auto pt-6">
        <DeleteAccountSection />
      </div>
    </main>
  );
}
