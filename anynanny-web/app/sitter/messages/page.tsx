"use client";

import { Suspense } from "react";
import { SitterBookingChatInbox } from "@/components/chat/booking-chat-inbox";

export default function SitterMessagesPage() {
  return (
    <main className="mx-auto w-full max-w-md space-y-4 bg-[#FDFBF6] py-2" dir="rtl">
      <Suspense
        fallback={
          <p className="text-right text-sm text-slate-600" dir="rtl">
            טוען הודעות…
          </p>
        }
      >
        <SitterBookingChatInbox />
      </Suspense>
    </main>
  );
}
