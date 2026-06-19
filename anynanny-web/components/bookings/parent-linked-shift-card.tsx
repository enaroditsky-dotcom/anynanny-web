"use client";

import Link from "next/link";
import { useState } from "react";
import { MessageCircle, UserRound } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import ChatInterface from "@/components/chat/ChatInterface";
import type { TodaysLinkedBookingView } from "@/lib/bookings/todays-linked-booking";

type Props = {
  booking: TodaysLinkedBookingView;
};

export function ParentLinkedShiftCard({ booking }: Props) {
  const { user } = useAuth();
  const [chatOpen, setChatOpen] = useState(false);

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
      <div className="mt-3 flex flex-row-reverse flex-wrap items-center gap-3">
        <Link
          href={`/parent/sitter/${booking.sitter_id}`}
          className="inline-flex flex-row-reverse items-center gap-1.5 text-xs font-semibold text-[#001F3F] underline decoration-[#001F3F]/30"
        >
          <UserRound className="h-3.5 w-3.5" aria-hidden />
          צפייה בפרופיל הבייביסיטר
        </Link>
        <button
          type="button"
          onClick={() => setChatOpen((open) => !open)}
          className="inline-flex flex-row-reverse items-center gap-1.5 rounded-lg border border-[#001F3F]/20 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#001F3F] shadow-sm transition hover:bg-[#001F3F]/5"
          aria-expanded={chatOpen}
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden />
          {chatOpen ? "סגירת שיחה" : "שיחה"}
        </button>
      </div>
      {chatOpen && user?.id ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-[#001F3F]/10 bg-white">
          <ChatInterface bookingId={booking.id} userId={user.id} />
        </div>
      ) : null}
    </div>
  );
}
