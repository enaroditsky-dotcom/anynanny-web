"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ArrowRight, MessageCircle } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { fetchBookingChatInboxForRole, type BookingChatInboxRow } from "@/lib/chat/booking-messages";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";

type BookingChatInboxProps = {
  role: "parent" | "sitter";
  dashboardHref: string;
  chatHref: (bookingId: string) => string;
  emptyPartnerLabel: string;
  emptyDescription: string;
  emptyActionHref?: string;
  emptyActionLabel?: string;
};

function BookingChatInbox({
  role,
  dashboardHref,
  chatHref,
  emptyPartnerLabel,
  emptyDescription,
  emptyActionHref,
  emptyActionLabel
}: BookingChatInboxProps) {
  const { isLoading, signedIn, effectiveRole } = useAuth();
  const [inbox, setInbox] = useState<BookingChatInboxRow[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(true);

  const loadInbox = useCallback(async () => {
    const auth = await resolveBrowserAuth();
    if (!auth.ok) {
      setLoadingInbox(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadingInbox(false);
      return;
    }

    const { rows, error } = await fetchBookingChatInboxForRole(supabase, auth.userId, role);
    if (error) {
      setInbox([]);
      setLoadingInbox(false);
      return;
    }

    setInbox(rows);
    setLoadingInbox(false);
  }, [role]);

  useEffect(() => {
    if (isLoading || !signedIn || effectiveRole !== role) return;
    void loadInbox();
  }, [isLoading, signedIn, effectiveRole, role, loadInbox]);

  return (
    <>
      <div className="flex items-center justify-between">
        <Link
          href={dashboardHref}
          className="inline-flex items-center gap-1 rounded-full border border-navy-header/20 bg-white px-3 py-1.5 text-xs font-semibold text-navy-header shadow-sm transition hover:bg-brand-cream"
        >
          <ArrowRight className="h-4 w-4" />
          חזרה לדשבורד
        </Link>
        <h1 className="text-lg font-bold text-navy-header">הודעות</h1>
      </div>

      {loadingInbox ? (
        <p className="text-right text-sm text-slate-600">טוען שיחות…</p>
      ) : inbox.length === 0 ? (
        <section className="rounded-2xl border border-navy-header/10 bg-white p-6 text-center shadow-sm">
          <MessageCircle className="mx-auto h-8 w-8 text-navy-header" strokeWidth={1.75} />
          <p className="mt-3 text-base font-semibold text-navy-900">אין שיחות עדיין</p>
          <p className="mt-1 text-sm text-navy-700">{emptyDescription}</p>
          {emptyActionHref && emptyActionLabel ? (
            <Link href={emptyActionHref} className="mt-4 inline-block text-sm font-semibold text-emerald-800 underline">
              {emptyActionLabel}
            </Link>
          ) : null}
        </section>
      ) : (
        <ul className="space-y-2">
          {inbox.map((row) => (
            <li key={row.booking_id}>
              <Link
                href={chatHref(row.booking_id)}
                className="flex flex-row-reverse items-center justify-between gap-3 rounded-2xl border border-navy-header/10 bg-white px-4 py-3 shadow-sm transition hover:bg-brand-cream/40"
              >
                <span className="text-xs tabular-nums text-slate-500">
                  {new Date(row.last_message_at).toLocaleDateString("he-IL", { dateStyle: "short" })}
                </span>
                <span className="min-w-0 flex-1 text-right">
                  <span className="flex min-w-0 items-center justify-end gap-1.5">
                    <span className="truncate text-sm font-semibold text-[#001F3F]">
                      {row.partner_name ?? emptyPartnerLabel}
                    </span>
                    {row.partner_public_id ? (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600 ring-1 ring-slate-200/80">
                        {row.partner_public_id} ID
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{row.schedule_label}</span>
                </span>
                <MessageCircle className="h-5 w-5 shrink-0 text-[#001F3F]" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function ParentBookingChatInbox() {
  return (
    <BookingChatInbox
      role="parent"
      dashboardHref="/parent/dashboard"
      chatHref={(bookingId) => `/parent/chat/${encodeURIComponent(bookingId)}`}
      emptyPartnerLabel="בייביסיטר"
      emptyDescription="שלחו הודעה ממשמרת פעילה או מפרופיל בייביסיטר לאחר תיאום משמרת."
      emptyActionHref="/parent/search"
      emptyActionLabel="לחיפוש בייביסיטרים"
    />
  );
}

export function SitterBookingChatInbox() {
  return (
    <BookingChatInbox
      role="sitter"
      dashboardHref="/sitter/dashboard"
      chatHref={(bookingId) => `/sitter/chat/${encodeURIComponent(bookingId)}`}
      emptyPartnerLabel="הורה"
      emptyDescription="כאן יופיעו שיחות עם הורים ממשמרות שיש בהן הודעות."
    />
  );
}
