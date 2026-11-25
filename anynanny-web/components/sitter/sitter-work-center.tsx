import Link from "next/link";
import { Briefcase } from "lucide-react";
import {
  SITTER_PENDING_REQUESTS_HREF,
  SITTER_UPCOMING_WEEK_SHIFTS_HREF
} from "@/lib/bookings/sitter-dashboard-destinations";

type SitterWorkCenterProps = {
  pendingCount: number;
  upcomingWeekCount: number | null;
};

function CountBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  const shown = count > 9 ? "9+" : String(count);
  return (
    <span
      className="absolute left-1 top-1 z-[1] inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#001F3F] px-1 text-[10px] font-bold leading-none text-white"
      aria-label={label}
    >
      {shown}
    </span>
  );
}

const cardClass =
  "relative flex min-w-0 flex-col justify-center gap-0.5 rounded-2xl border border-[#8ED4AE] bg-white px-1.5 py-1 text-right shadow-[0_8px_18px_-14px_rgba(14,159,110,0.65)] transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E9F6E]";

function CardArt({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      width={32}
      height={32}
      className="h-8 w-8 shrink-0 object-contain"
    />
  );
}

export function SitterWorkCenter({ pendingCount, upcomingWeekCount }: SitterWorkCenterProps) {
  const weekCount = upcomingWeekCount != null && upcomingWeekCount > 0 ? upcomingWeekCount : 0;

  return (
    <section
      className="w-full min-w-0 rounded-[1.35rem] border border-[#D5E8DC] bg-[#F7FBF8] p-2.5 shadow-[0_10px_22px_-18px_rgba(14,90,60,0.35)]"
      dir="rtl"
    >
      <h2 className="mb-1.5 flex items-center gap-1.5 text-sm font-extrabold text-[#001F3F]">
        <Briefcase className="h-4 w-4 shrink-0 text-[#0E9F6E]" aria-hidden />
        <span>מרכז העבודה שלי</span>
      </h2>
      <div className="grid grid-cols-2 items-stretch gap-2">
        <Link href={SITTER_PENDING_REQUESTS_HREF} className={cardClass}>
          <CountBadge
            count={pendingCount}
            label={pendingCount === 1 ? "פנייה אחת ממתינה" : `${pendingCount} פניות ממתינות`}
          />
          <span className="flex min-w-0 items-center gap-1">
            <CardArt src="/images/sitter-notification-bell.png" />
            <span className="min-w-0 text-[17px] font-extrabold leading-snug text-[#001F3F]">
              פניות חדשות
            </span>
          </span>
          <span className="block w-full text-center text-[11px] font-medium leading-snug text-slate-600 max-[334px]:whitespace-normal min-[335px]:whitespace-nowrap">
            בקשות שממתינות לתגובה
          </span>
          <span aria-hidden className="mx-1 mt-0.5 h-[3px] shrink-0 rounded-full bg-[#7DCAA0]" />
        </Link>
        <Link href={SITTER_UPCOMING_WEEK_SHIFTS_HREF} className={cardClass}>
          <CountBadge
            count={weekCount}
            label={weekCount === 1 ? "משמרת אחת בשבוע הקרוב" : `${weekCount} משמרות בשבוע הקרוב`}
          />
          <span className="flex min-w-0 items-center gap-1">
            <CardArt src="/images/sitter-work-calendar.png" />
            <span className="min-w-0 text-[17px] font-extrabold leading-snug text-[#001F3F]">
              העבודות שלי
            </span>
          </span>
          <span className="block w-full text-center text-[11px] font-medium leading-snug text-slate-600 max-[334px]:whitespace-normal min-[335px]:whitespace-nowrap">
            משמרות בשבוע הקרוב
          </span>
          <span aria-hidden className="mx-1 mt-0.5 h-[3px] shrink-0 rounded-full bg-[#7DCAA0]" />
        </Link>
      </div>
    </section>
  );
}
