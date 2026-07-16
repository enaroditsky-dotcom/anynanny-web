"use client";

import { Calendar, CheckCircle2, MessageCircle, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { BookShiftModal } from "@/components/parent/book-shift-modal";
import { findChatBookingForParentSitter } from "@/lib/chat/booking-messages";
import { fetchPendingBookingForParentSitter } from "@/lib/bookings/todays-linked-booking";
import { BOOKINGS_TABLE, type BookingRow, type BookingStatus } from "@/lib/bookings/constants";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";

export type SitterProfileActionsProps = {
  sitterId: string;
  sitterName: string;
  onBookingSuccess?: (bookingId: string) => void;
};

const REJECTION_NOTICE = "הבקשה נדחתה על ידי המטפלת";

function applyBookingStatusFromPayload(
  payload: RealtimePostgresChangesPayload<Pick<BookingRow, "status">>,
  setBookingStatus: (status: BookingStatus) => void
) {
  if (payload.eventType === "DELETE") {
    setBookingStatus("cancelled");
    return;
  }

  const row = (payload.new ?? null) as Pick<BookingRow, "status"> | null;
  if (row?.status) {
    setBookingStatus(row.status);
  }
}

/**
 * Primary CTAs on the public sitter profile: message (booking chat) and book shift (bookings pending).
 */
export function SitterProfileActions({ sitterId, sitterName, onBookingSuccess }: SitterProfileActionsProps) {
  const router = useRouter();
  const [messageBusy, setMessageBusy] = useState(false);
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const [bookingStatus, setBookingStatus] = useState<BookingStatus | null>(null);

  const handleBookingSuccess = useCallback(
    (bookingId: string) => {
      setBookModalOpen(false);
      setPendingBookingId(bookingId);
      setBookingStatus("pending");
      setActionError(null);
      onBookingSuccess?.(bookingId);
    },
    [onBookingSuccess]
  );

  /** Restore "request sent" banner after refresh/tab switch from DB. */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const auth = await resolveBrowserAuth();
      if (!auth.ok || cancelled) return;

      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      const pending = await fetchPendingBookingForParentSitter(supabase, auth.userId, sitterId);
      if (cancelled || !pending) return;

      setPendingBookingId(pending.id);
      setBookingStatus(pending.status);
    })();

    return () => {
      cancelled = true;
    };
  }, [sitterId]);

  useEffect(() => {
    if (!pendingBookingId) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;

    void (async () => {
      const { data, error } = await supabase
        .from(BOOKINGS_TABLE)
        .select("status, updated_at")
        .eq("id", pendingBookingId)
        .maybeSingle();
      if (cancelled || error || !data) return;
      const next = (data as { status?: BookingStatus }).status ?? null;
      if (next) setBookingStatus(next);
    })();

    const handleRealtimeChange = (payload: RealtimePostgresChangesPayload<Pick<BookingRow, "status">>) => {
      applyBookingStatusFromPayload(payload, setBookingStatus);
    };

    const channel = subscribePostgresChanges(supabase, `booking-status-${pendingBookingId}`, [
      {
        event: "UPDATE",
        table: BOOKINGS_TABLE,
        filter: `id=eq.${pendingBookingId}`,
        handler: handleRealtimeChange
      },
      {
        event: "INSERT",
        table: BOOKINGS_TABLE,
        filter: `id=eq.${pendingBookingId}`,
        handler: handleRealtimeChange
      }
    ]);

    return () => {
      cancelled = true;
      removeRealtimeChannel(supabase, channel);
    };
  }, [pendingBookingId]);

  useEffect(() => {
    if (bookingStatus === "approved") {
      router.push("/parent/dashboard");
    }
  }, [bookingStatus, router]);

  const handleSendMessage = useCallback(async () => {
    if (!sitterId) return;
    setActionError(null);
    setMessageBusy(true);

    const auth = await resolveBrowserAuth();
    if (!auth.ok) {
      setActionError("יש להתחבר מחדש");
      setMessageBusy(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setActionError("Supabase לא זמין");
      setMessageBusy(false);
      return;
    }

    const { bookingId, error } = await findChatBookingForParentSitter(supabase, auth.userId, sitterId);
    setMessageBusy(false);

    if (error || !bookingId) {
      setActionError(error ?? "לא ניתן לפתוח שיחה");
      return;
    }

    router.push(`/parent/chat/${encodeURIComponent(bookingId)}`);
  }, [sitterId, router]);

  const handleBookShift = useCallback(() => {
    setActionError(null);
    setBookModalOpen(true);
  }, []);

  const showRejectedNotice = bookingStatus === "rejected" || bookingStatus === "cancelled";
  const showPendingBanner = Boolean(pendingBookingId) && !showRejectedNotice && bookingStatus !== "approved";

  return (
    <>
      {showPendingBanner ? (
        <div
          className="flex flex-row-reverse items-start justify-between gap-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-right shadow-soft"
          role="status"
          aria-live="polite"
        >
          <div className="flex min-w-0 flex-1 flex-row-reverse items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-emerald-950">בקשה נשלחה וממתינה לאישור</p>
              <p className="mt-0.5 text-xs leading-snug text-emerald-900">
                שלחנו ל-{sitterName} בקשת תיאום משמרת. תקבלו עדכון כשתאשר או תדחה.
              </p>
            </div>
          </div>
        </div>
      ) : null}

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

        {showRejectedNotice ? (
          <div
            className="rounded-2xl border-2 border-rose-400 bg-rose-50 px-4 py-3.5 text-right shadow-sm"
            role="alert"
            aria-live="assertive"
          >
            <div className="flex flex-row-reverse items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setPendingBookingId(null);
                  setBookingStatus(null);
                }}
                className="shrink-0 rounded-full p-1 text-rose-900 transition hover:bg-rose-100"
                aria-label="סגור"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold leading-snug text-rose-950">
                  {bookingStatus === "cancelled" ? "בקשת המשמרת בוטלה." : REJECTION_NOTICE}
                </p>
                <p className="mt-1 text-xs leading-snug text-rose-900">
                  ניתן לנסות תאריך או שעה אחרים, או לבחור בייביסיטר אחרת.
                </p>
              </div>
            </div>
          </div>
        ) : null}

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
        onSuccess={handleBookingSuccess}
      />
    </>
  );
}
