"use client";

import { useState } from "react";
import { Search, Star } from "lucide-react";
import { VerifiedUserBadge } from "@/components/identity/verified-user-badge";
import { LongPrimaryCtaContent } from "@/components/ui/long-primary-cta";
import { APP_CONTENT_MAX_W } from "@/lib/ui/app-shell";
import { PARENT_SITTER_SEARCH_CTA_LABEL } from "@/lib/ui/long-primary-cta";

const SAMPLE_NAME = "נועה";
const SAMPLE_PUBLIC_ID = "P-1008";
const SAMPLE_RATING = "4.8";
const SAMPLE_REVIEW_COUNT = 12;
const SAMPLE_PHOTO_SRC = "/marketing/demo/inbal.png";

/** About 30% smaller than the first preview: 52px tall, 18px type, 25px icon. */
const PREVIEW_SEARCH_CLASS =
  "inline-flex h-[52px] w-fit max-w-full items-center justify-center rounded-full bg-[#001F3F] px-[21px] text-[18px] font-bold leading-[1.4] text-white shadow-sm transition hover:bg-[#003366] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#001F3F] focus-visible:ring-offset-2 active:scale-[0.99]";
const PREVIEW_SEARCH_ICON_CLASS = "h-[25px] w-[25px] shrink-0";

const UNVERIFIED_BADGE_CLASS =
  "inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700";

function stop(event: { preventDefault: () => void; stopPropagation: () => void }) {
  event.preventDefault();
  event.stopPropagation();
}

export function ParentProfileHeaderPreview() {
  const [verified, setVerified] = useState(true);

  return (
    <main
      data-dev-parent-profile-header=""
      className={`mx-auto w-full min-w-0 ${APP_CONTENT_MAX_W} px-2 pb-10 pt-3`}
      dir="rtl"
    >
      <p className="text-[11px] font-semibold text-slate-500">
        תצוגת פיתוח — נתונים לדוגמה, ללא פרופיל אמיתי
      </p>

      <div className="mt-2 flex flex-wrap gap-2" dir="rtl">
        <button
          type="button"
          aria-pressed={verified}
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            verified ? "bg-[#001F3F] text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
          }`}
          onClick={() => setVerified(true)}
        >
          זהות מאומתת
        </button>
        <button
          type="button"
          aria-pressed={!verified}
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            !verified ? "bg-[#001F3F] text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
          }`}
          onClick={() => setVerified(false)}
        >
          לאימות הזהות
        </button>
      </div>

      <section
        data-preview-profile-card=""
        className="mt-3 w-full min-w-0 rounded-xl border border-slate-100 bg-slate-50/70 p-3"
      >
        <h1 className="text-right text-base font-bold leading-snug text-slate-900">
          שלום, {SAMPLE_NAME}!
        </h1>

        <div className="mt-2 flex items-center justify-between gap-3" dir="ltr">
          <div data-preview-badges="" className="flex min-w-0 flex-col items-start gap-2">
            <span
              className="inline-flex w-fit shrink-0 items-center gap-1 rounded-md border border-purple-200 bg-purple-100 px-2 py-0.5 text-[12px] font-bold text-purple-800"
              dir="ltr"
            >
              <span>{SAMPLE_PUBLIC_ID}</span>
              <span className="text-[11px] font-normal text-purple-500">ID</span>
            </span>

            {verified ? (
              <span className="inline-flex w-fit shrink-0">
                <VerifiedUserBadge size="lg" />
              </span>
            ) : (
              <button type="button" className={`${UNVERIFIED_BADGE_CLASS} w-fit shrink-0`} onClick={stop}>
                לאימות הזהות
              </button>
            )}

            <div className="inline-flex w-fit shrink-0 items-center gap-1 rounded-md border border-amber-200/60 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
              <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
              <span>{SAMPLE_RATING}</span>
              <span className="text-[13px] text-slate-400">({SAMPLE_REVIEW_COUNT} חוות דעת)</span>
            </div>
          </div>

          <div
            data-preview-profile-photo=""
            className="shrink-0 rounded-[1.15rem] border border-[#E4D3B4] bg-[#FBF7EF] p-1.5 shadow-[0_14px_28px_-16px_rgba(0,31,63,0.55),inset_0_1px_0_rgba(255,255,255,0.92)]"
          >
            <div className="overflow-hidden rounded-[0.8rem] bg-white shadow-[inset_0_0_0_1px_rgba(0,31,63,0.08)]">
              <img
                src={SAMPLE_PHOTO_SRC}
                alt="תמונת פרופיל לדוגמה"
                className="block h-[6.75rem] w-[6.75rem] object-contain"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="mt-3 flex justify-center">
        <button
          type="button"
          data-preview-search=""
          className={PREVIEW_SEARCH_CLASS}
          onClick={stop}
        >
          <LongPrimaryCtaContent icon={<Search className={PREVIEW_SEARCH_ICON_CLASS} />}>
            {PARENT_SITTER_SEARCH_CTA_LABEL}
          </LongPrimaryCtaContent>
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-4 text-center text-xs text-slate-500">
        התוכן שמתחת לכפתור. התצוגה הזו מאפשרת את הגובה הנוסף.
      </div>
    </main>
  );
}
