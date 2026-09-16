"use client";

import { useParams } from "next/navigation";
import { BookingChat, BookingChatHeader } from "@/components/chat/parent-chat-room";

function parseBookingId(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  return trimmed;
}

export default function SitterChatPage() {
  const params = useParams();
  const bookingId = parseBookingId(params?.bookingId);

  if (!bookingId) {
    return (
      <main className="mx-auto w-full max-w-sm bg-[#FDFBF6] py-6 text-center text-sm text-slate-600" dir="rtl">
        מזהה משמרת לא תקין.
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-sm space-y-3 bg-[#FDFBF6] py-2 pb-24" dir="rtl">
      <div data-tour="sitter-messages-chat">
        <BookingChatHeader bookingId={bookingId} backHref="/sitter/messages" />
        <BookingChat bookingId={bookingId} messagesHref="/sitter/messages" />
      </div>
    </main>
  );
}
