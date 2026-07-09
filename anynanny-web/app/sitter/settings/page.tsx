import Link from "next/link";
import { DeleteAccountSection } from "@/components/account/delete-account-section";
import { LogoutButton } from "@/components/account/logout-button";

export default function SitterSettingsPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-md flex-col bg-[#FDFBF6] py-2 pb-8" dir="rtl">
      <header className="text-right">
        <h1 className="text-xl font-bold text-[#001F3F]">הגדרות חשבון</h1>
        <p className="mt-1 text-sm text-slate-600">העדפות חשבון והתראות — בקרוב.</p>
      </header>

      <Link
        href="/sitter/dashboard"
        className="mt-4 inline-block text-right text-sm font-semibold text-navy-header underline decoration-navy-header/30"
      >
        חזרה לדשבורד
      </Link>

      <div className="mt-8 space-y-3">
        <h2 className="text-right text-sm font-bold text-navy-header">חשבון</h2>
        <LogoutButton />
      </div>

      <div className="flex-1" aria-hidden />

      <div className="pt-6">
        <DeleteAccountSection />
      </div>
    </main>
  );
}
