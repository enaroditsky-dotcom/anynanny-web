"use client";

import { Calendar, MessageCircle } from "lucide-react";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { BookShiftModal } from "@/components/parent/book-shift-modal";
import { getOrCreateChatRoom } from "@/lib/chat/parent-chat";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type SitterProfileActionsProps = {
  sitterId: string;
  sitterName: string;
  onBookingSuccess?: () => void;
};

/**
 * Primary CTAs on the public sitter profile: message (chat_rooms) and book shift (bookings pending).
 */
export function SitterProfileActions({ sitterId, sitterName, onBookingSuccess }: SitterProfileActionsProps) {
  const router = useRouter();
  const [messageBusy, setMessageBusy] = useState(false);
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSendMessage = useCallback(async () => {
    if (!sitterId) return;
    setActionError(null);
    setMessageBusy(true);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setActionError("Supabase לא זמין");
      setMessageBusy(false);
      return;
    }

    const { roomId, error } = await getOrCreateChatRoom(supabase, sitterId);
    setMessageBusy(false);

    if (error || !roomId) {
      setActionError(error ?? "לא ניתן לפתוח שיחה");
      return;
    }

    router.push(`/parent/chat/${encodeURIComponent(roomId)}`);
  }, [sitterId, router]);

  const handleBookShift = useCallback(() => {
    setActionError(null);
    setBookModalOpen(true);
  }, []);

  return (
    <>
      {actionError ? (
        <p
          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-right text-xs text-rose-900"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3">
        <button
          type="button"
          onClick={() => void handleSendMessage()}
          disabled={messageBusy}
          className="group flex w-full flex-row-reverse items-center gap-3 rounded-2xl border-2 border-[#001F3F]/15 bg-gradient-to-l from-white to-[#FDFBF6] px-4 py-4 text-right shadow-sm transition hover:border-[#001F3F]/30 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#001F3F] disabled:opacity-60 active:scale-[0.99]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#001F3F]/8 text-[#001F3F] ring-1 ring-[#001F3F]/10 transition group-hover:bg-[#001F3F]/12">
            <MessageCircle className="h-6 w-6" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold text-[#001F3F]">
              {messageBusy ? "פותחים שיחה…" : "שלח הודעה"}
            </span>
            <span className="mt-0.5 block text-xs leading-snug text-slate-600">
              שיחה פרטית — הבייביסיטר תקבל התראה בתיבת ההודעות
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={handleBookShift}
          className="group flex w-full flex-row-reverse items-center gap-3 rounded-2xl border-2 border-[#001F3F] bg-[#001F3F] px-4 py-4 text-right shadow-[0_12px_32px_-8px_rgba(0,31,63,0.45)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#001F3F] active:scale-[0.99]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/25">
            <Calendar className="h-6 w-6" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold text-white">תיאום משמרת</span>
            <span className="mt-0.5 block text-xs leading-snug text-white/85">
              בחרו תאריך ושעות — הבקשה תישלח לאישור
            </span>
          </span>
        </button>
      </div>

      <BookShiftModal
        open={bookModalOpen}
        sitterId={sitterId}
        sitterName={sitterName}
        onClose={() => setBookModalOpen(false)}
        onSuccess={() => {
          onBookingSuccess?.();
        }}
      />
    </>
  );
}
