"use client";

import { ShieldCheck } from "lucide-react";

const TITLE = "אמתו את הזהות שלכם והשלימו אמצעי תשלום";
const COPY =
  "האימות מאפשר לבצע תשלומים או לקבל תשלומים דרך AnyNanny, ומוסיף לפרופיל שלכם סימון 'משתמש מאומת'. משתמשים מאומתים נתפסים כאמינים יותר ומגדילים את הסיכוי לסגירת משמרות.";

type IdentityOnboardingCardProps = {
  onVerifyNow: () => void;
  onSkipLater: () => void;
  busy?: boolean;
};

export function IdentityOnboardingCard({
  onVerifyNow,
  onSkipLater,
  busy = false
}: IdentityOnboardingCardProps) {
  return (
    <div className="space-y-4 text-right" dir="rtl">
      <div className="rounded-2xl border-2 border-[#C5A059]/40 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-end gap-2">
          <h3 className="text-[15px] font-extrabold leading-snug text-[#001F3F]">{TITLE}</h3>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80">
            <ShieldCheck className="h-4 w-4" aria-hidden />
          </span>
        </div>
        <p className="text-xs leading-relaxed text-slate-600">{COPY}</p>
        <p className="mt-2 text-[11px] text-slate-500">
          ניתן להשלים את האימות גם מאוחר יותר מהאזור האישי. זה לא חוסם את סיום ההרשמה.
        </p>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={onVerifyNow}
        className="w-full rounded-2xl bg-[#001F3F] py-3.5 font-bold text-white transition hover:bg-blue-900 disabled:opacity-60"
      >
        אימות עכשיו
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onSkipLater}
        className="w-full rounded-2xl border-2 border-[#001F3F]/20 py-3.5 font-bold text-[#001F3F] transition hover:bg-white/60 disabled:opacity-60"
      >
        {busy ? "שומר..." : "אעשה זאת מאוחר יותר"}
      </button>
    </div>
  );
}
