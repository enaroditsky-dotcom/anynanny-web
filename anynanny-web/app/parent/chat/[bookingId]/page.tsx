"use client";

import { useParams } from "next/navigation";
import { BookingChat, BookingChatHeader } from "@/components/chat/parent-chat-room";

function parseBookingId(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  return trimmed;
}

export default function ParentChatPage() {
  const params = useParams();
  const bookingId = parseBookingId(params?.bookingId);

  if (!bookingId) {
    return (
      <main className="mx-auto w-full max-w-md bg-[#FDFBF6] py-6 text-center text-sm text-slate-600" dir="rtl">
        מזהה משמרת לא תקין.
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md space-y-4 bg-[#FDFBF6] py-2 pb-24" dir="rtl">
      <BookingChatHeader bookingId={bookingId} backHref="/parent/messages" />
      <BookingChat bookingId={bookingId} messagesHref="/parent/messages" />
    </main>
  );
}
