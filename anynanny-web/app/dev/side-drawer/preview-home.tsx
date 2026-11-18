"use client";

import { Search, User } from "lucide-react";
import { LongPrimaryCtaContent } from "@/components/ui/long-primary-cta";
import { APP_CONTENT_MAX_W } from "@/lib/ui/app-shell";
import {
  LONG_PRIMARY_CTA_CLASS,
  LONG_PRIMARY_CTA_ICON_CLASS,
  PARENT_SITTER_SEARCH_CTA_LABEL
} from "@/lib/ui/long-primary-cta";

type PreviewRole = "parent" | "sitter";

function stop(event: { preventDefault: () => void; stopPropagation: () => void }) {
  event.preventDefault();
  event.stopPropagation();
}

/** Static home sample. No account, booking, or profile data. */
export function PreviewHome({ role }: { role: PreviewRole }) {
  const sitter = role === "sitter";

  return (
    <main data-preview-home={role} className={`mx-auto w-full min-w-0 ${APP_CONTENT_MAX_W} space-y-3`} dir="rtl">
      <p className="text-[11px] font-semibold text-slate-500">תצוגה סטטית — ללא חשבון וללא נתונים</p>
      <section className="rounded-xl border border-slate-100 bg-slate-50/70 p-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400">
            <User className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="text-base font-bold text-slate-900">שלום</h1>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {sitter
            ? "מסך הבית של הבייביסיטר בתצוגת הפיתוח. אין כאן משמרת, ארנק או פרופיל."
            : "מסך הבית של ההורה בתצוגת הפיתוח. אין כאן משמרת, חיפוש אמיתי או פרופיל."}
        </p>
      </section>

      <section className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-4 text-center">
        <p className="text-sm font-bold text-[#001F3F]">אין משמרת פעילה</p>
        <p className="mt-1 text-xs text-slate-500">כרטיס הסטטוס נשאר ריק בתצוגה הזו.</p>
      </section>

      {!sitter ? (
        <button type="button" className={LONG_PRIMARY_CTA_CLASS} onClick={stop}>
          <LongPrimaryCtaContent icon={<Search className={LONG_PRIMARY_CTA_ICON_CLASS} />}>
            {PARENT_SITTER_SEARCH_CTA_LABEL}
          </LongPrimaryCtaContent>
        </button>
      ) : null}
    </main>
  );
}
