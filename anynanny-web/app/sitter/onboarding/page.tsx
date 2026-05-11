import Link from "next/link";
import { SitterOnboardingWizard } from "@/components/sitter/sitter-onboarding-wizard";

export default function SitterOnboardingPage() {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-full flex-col items-center gap-4 py-6" dir="rtl">
      <section className="w-full min-w-0 max-w-md rounded-3xl bg-white p-6 shadow-soft">
        <h1 className="text-center text-2xl font-bold text-navy-header">השלמת פרופיל בייביסיטר</h1>
        <p className="mt-1 text-center text-sm text-slate-600">השדות נשמרים בחשבון שלך לאחר אישור ההצהרה.</p>
        <div className="mt-6">
          <SitterOnboardingWizard />
        </div>
        <p className="mt-6 text-center text-sm text-slate-600">
          <Link href="/sitter/dashboard" className="font-semibold text-navy-header underline">
            חזרה לדשבורד
          </Link>
        </p>
      </section>
    </main>
  );
}
