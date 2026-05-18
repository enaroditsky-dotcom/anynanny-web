import Link from "next/link";
import { UserRound } from "lucide-react";
import type { TodaysLinkedBookingView } from "@/lib/bookings/todays-linked-booking";

type Props = {
  booking: TodaysLinkedBookingView;
};

export function ParentLinkedShiftCard({ booking }: Props) {
  const sitterName = booking.partner_full_name ?? "הבייביסיטר";
  const sitterCode = booking.partner_sitter_code?.trim();
  const waitingParent = booking.status === "sitter_started";

  return (
    <div
      className={`mb-4 w-full rounded-2xl border px-4 py-3 text-right ${
        waitingParent ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50/90"
      }`}
    >
      <p className="text-xs font-semibold text-slate-600">משמרת מאושרת להיום</p>
      <p className="mt-1 text-sm font-bold text-[#001F3F]">
        {sitterName}
        {sitterCode ? <span className="font-semibold text-slate-600"> ({sitterCode})</span> : null}
      </p>
      <p className="mt-0.5 text-xs tabular-nums text-slate-600">{booking.schedule_label}</p>
      {waitingParent ? (
        <p className="mt-2 text-xs font-semibold text-amber-900">
          הבייביסיטר סימנה הגעה — ניתן לאשר התחלה ב-Double-Shake למטה.
        </p>
      ) : (
        <p className="mt-2 text-xs text-emerald-900">מקושרת לבייביסיטר שבחרתם להיום.</p>
      )}
      <Link
        href={`/parent/sitter/${booking.sitter_id}`}
        className="mt-3 inline-flex flex-row-reverse items-center gap-1.5 text-xs font-semibold text-[#001F3F] underline decoration-[#001F3F]/30"
      >
        <UserRound className="h-3.5 w-3.5" aria-hidden />
        צפייה בפרופיל הבייביסיטר
      </Link>
    </div>
  );
}
