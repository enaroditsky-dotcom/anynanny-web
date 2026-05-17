"use client";

import { useParams } from "next/navigation";
import { ParentChatRoom, ParentChatRoomHeader } from "@/components/chat/parent-chat-room";

function parseRoomId(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  return trimmed;
}

export default function ParentChatPage() {
  const params = useParams();
  const roomId = parseRoomId(params?.chatRoomId);

  if (!roomId) {
    return (
      <main className="mx-auto w-full max-w-md bg-[#FDFBF6] py-6 text-center text-sm text-slate-600" dir="rtl">
        מזהה שיחה לא תקין.
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md space-y-4 bg-[#FDFBF6] py-2 pb-24" dir="rtl">
      <ParentChatRoomHeader roomId={roomId} backHref="/parent/messages" />
      <ParentChatRoom roomId={roomId} />
    </main>
  );
}
