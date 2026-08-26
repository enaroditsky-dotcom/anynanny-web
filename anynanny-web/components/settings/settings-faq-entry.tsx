import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { FAQ_PAGE_TITLE } from "@/lib/faq/faq-items";

export function SettingsFaqEntry({ href }: { href: string }) {
  return (
    <div className="mt-6 rounded-3xl border border-slate-200/60 bg-white p-4 shadow-soft space-y-3 text-right">
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">עזרה</h2>
      <Link
        href={href}
        className="flex items-center justify-between rounded-xl p-2.5 transition hover:bg-slate-50"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
            <CircleHelp className="h-4 w-4" aria-hidden />
          </div>
          <span className="text-sm font-bold text-slate-700">{FAQ_PAGE_TITLE}</span>
        </div>
      </Link>
    </div>
  );
}
