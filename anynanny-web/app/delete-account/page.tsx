import type { Metadata } from "next";
import { AccountDeletionDocument } from "@/components/legal/account-deletion-document";
import { PageBackLink, PageBackRow } from "@/components/navigation/page-back-link";

export const metadata: Metadata = {
  title: "מחיקת חשבון | AnyNanny",
  description: "מידע ובקשה למחיקת חשבון AnyNanny והנתונים המשויכים אליו."
};

export default function DeleteAccountPage() {
  return (
    <main
      className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-md flex-col bg-[#FDFBF6]"
      dir="rtl"
    >
      <header className="sticky top-0 z-10 shrink-0 space-y-2 border-b border-navy-header/10 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-sm">
        <PageBackRow>
          <PageBackLink href="/" />
        </PageBackRow>
        <p className="text-right text-sm font-bold text-navy-header">מחיקת חשבון</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 pb-10">
        <AccountDeletionDocument />
      </div>
    </main>
  );
}
