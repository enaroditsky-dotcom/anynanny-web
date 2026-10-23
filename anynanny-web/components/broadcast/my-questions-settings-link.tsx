import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { MY_QUESTIONS_HREF } from "@/lib/broadcast/question-link";

export function MyQuestionsSettingsLink() {
  return (
    <div className="mt-6 rounded-3xl border border-slate-200/60 bg-white p-4 text-right shadow-soft">
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">שאלות</h2>
      <Link
        href={MY_QUESTIONS_HREF}
        className="mt-3 flex items-center gap-2.5 rounded-xl p-2.5 transition hover:bg-slate-50"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-800">
          <ClipboardList className="h-4 w-4" aria-hidden />
        </span>
        <span>
          <span className="block text-sm font-bold text-slate-700">השאלות שלי</span>
          <span className="block text-xs text-slate-500">שאלות פתוחות ותשובות שכבר נשמרו</span>
        </span>
      </Link>
    </div>
  );
}
