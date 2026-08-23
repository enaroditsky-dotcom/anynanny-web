"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import ChatInterface from "@/components/chat/ChatInterface";
import { PageBackLink } from "@/components/navigation/page-back-link";
import { UserSafetyActions } from "@/components/safety/user-safety-actions";
import { verifyBookingChatParticipant } from "@/lib/chat/booking-messages";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type BookingChatProps = {
  bookingId: string;
  messagesHref: string;
};

export function BookingChat({ bookingId, messagesHref }: BookingChatProps) {
  const { user, signedIn, isLoading } = useAuth();
  const [loadState, setLoadState] = useState<"loading" | "ready" | "denied" | "error">("loading");

  const verifyAccess = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user?.id) {
      setLoadState("error");
      return;
    }

    const { allowed, error } = await verifyBookingChatParticipant(supabase, bookingId, user.id);
    if (!allowed) {
      setLoadState(error === "denied" ? "denied" : "error");
      return;
    }

    setLoadState("ready");
  }, [bookingId, user?.id]);

  useEffect(() => {
    if (isLoading || !signedIn) return;
    void verifyAccess();
  }, [isLoading, signedIn, verifyAccess]);

  if (isLoading || !signedIn) {
    return <p className="px-1 text-right text-sm text-slate-600">טוען…</p>;
  }

  if (loadState === "denied") {
    return (
      <section className="rounded-2xl border border-navy-header/10 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-navy-900">השיחה לא נמצאה או שאין גישה.</p>
        <Link href={messagesHref} className="mt-3 inline-block text-sm font-semibold text-emerald-800 underline">
          חזרה להודעות
        </Link>
      </section>
    );
  }

  if (loadState === "loading") {
    return <p className="px-1 text-right text-sm text-slate-600">טוען שיחה…</p>;
  }

  if (loadState === "error" || !user?.id) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-right text-sm text-rose-900">
        שגיאה בטעינת השיחה.
      </section>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-navy-header/10 bg-white shadow-sm">
      <ChatInterface bookingId={bookingId} userId={user.id} />
    </div>
  );
}

export function BookingChatHeader({ bookingId, backHref }: { bookingId: string; backHref: string }) {
  const { user } = useAuth();
  const [title, setTitle] = useState("שיחה");
  const [partnerId, setPartnerId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user?.id) return;

    void (async () => {
      const { partnerName, partnerId: nextPartnerId } = await verifyBookingChatParticipant(
        supabase,
        bookingId,
        user.id
      );
      if (partnerName) setTitle(partnerName);
      if (nextPartnerId) setPartnerId(nextPartnerId);
    })();
  }, [bookingId, user?.id]);

  return (
    <div className="space-y-2">
      <div className="flex w-full items-center justify-between gap-3" dir="ltr">
        <PageBackLink href={backHref} />
        <h1 className="text-right text-lg font-bold text-navy-header" dir="rtl">
          {title}
        </h1>
      </div>
      {partnerId ? (
        <div className="flex justify-end">
          <UserSafetyActions targetUserId={partnerId} targetName={title} />
        </div>
      ) : null}
    </div>
  );
}

/** @deprecated Use BookingChat */
export const ParentBookingChat = BookingChat;
/** @deprecated Use BookingChatHeader */
export const ParentBookingChatHeader = BookingChatHeader;
