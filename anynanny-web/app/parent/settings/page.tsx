import Link from "next/link";
import { DeleteAccountSection } from "@/components/account/delete-account-section";
import { LogoutButton } from "@/components/account/logout-button";
import { NotificationSettingsSection } from "@/components/settings/notification-settings-section";
import { FileText, Shield, ExternalLink } from "lucide-react";

export default function ParentSettingsPage() {
  return (
    <main
      className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-md flex-col bg-[#FDFBF6] py-2 pb-8 px-3"
      dir="rtl"
    >
      <header className="text-right">
        <h1 className="text-xl font-bold text-[#001F3F]">הגדרות חשבון</h1>
        <p className="mt-1 text-sm text-slate-600">ניהול חשבון, פרטיות והתראות</p>
      </header>

      <Link
        href="/parent/dashboard"
        className="mt-4 inline-block text-right text-sm font-semibold text-navy-header underline decoration-navy-header/30"
      >
        חזרה לדשבורד
      </Link>

      <div className="mt-6">
        <NotificationSettingsSection />
      </div>

      {/* מידע משפטי ותקנון - דרישת חנויות Apple ו-Google */}
      <div className="mt-6 rounded-3xl border border-slate-200/60 bg-white p-4 shadow-soft space-y-3 text-right">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">משפטי ותנאי שימוש</h2>
        
        <a
          href="/terms" 
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-xl p-2.5 transition hover:bg-slate-50"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <FileText className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold text-slate-700">תנאי שימוש (Terms of Service)</span>
          </div>
          <ExternalLink className="h-4 w-4 text-slate-400" />
        </a>

        <a
          href="/privacy" 
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-xl p-2.5 transition hover:bg-slate-50 border-t border-slate-100"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Shield className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold text-slate-700">מדיניות פרטיות (Privacy Policy)</span>
          </div>
          <ExternalLink className="h-4 w-4 text-slate-400" />
        </a>
      </div>

      <div className="mt-6 space-y-3">
        <h2 className="text-right text-sm font-bold text-navy-header">חשבון</h2>
        <LogoutButton />
      </div>

      <div className="mt-auto pt-6">
        <DeleteAccountSection />
      </div>
    </main>
  );
}