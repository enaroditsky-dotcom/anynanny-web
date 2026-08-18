"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { PageBackLink, PageBackRow } from "@/components/navigation/page-back-link";
import { fetchBookingChatInboxForRole, type BookingChatInboxRow } from "@/lib/chat/booking-messages";
import { chatLifecycleFromInboxRow, type ChatLifecycle } from "@/lib/chat/chat-lifecycle";
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

function ConversationCard({
  row,
  lifecycle,
  chatHref,
  emptyPartnerLabel
}: {
  row: BookingChatInboxRow;
  lifecycle: ChatLifecycle;
  chatHref: (bookingId: string) => string;
  emptyPartnerLabel: string;
}) {
  const past = lifecycle.section === "past";
  const cancelled = lifecycle.kind === "cancelled";
  const completed = lifecycle.kind === "completed";

  return (
    <Link
      href={chatHref(row.booking_id)}
      className={`flex flex-row-reverse items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-sm transition ${
        past
          ? "border-slate-200 bg-slate-50 hover:bg-slate-100/80"
          : "border-navy-header/10 bg-white hover:bg-brand-cream/40"
      }`}
    >
      <span className="text-xs tabular-nums text-slate-500">
        {new Date(row.last_message_at).toLocaleDateString("he-IL", { dateStyle: "short" })}
      </span>
      <span className="min-w-0 flex-1 text-right">
        <span className="flex min-w-0 items-center justify-end gap-1.5">
          <span className={`truncate text-sm font-semibold ${past ? "text-slate-700" : "text-[#001F3F]"}`}>
            {row.partner_name ?? emptyPartnerLabel}
          </span>
          {row.partner_public_id ? (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-slate-600 ring-1 ring-slate-200/80">
              {row.partner_public_id} ID
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">{row.schedule_label}</span>
        {lifecycle.label ? (
          <span
            className={`mt-0.5 block text-[11px] font-medium ${
              cancelled ? "text-orange-800/90" : completed ? "text-slate-600" : "text-slate-500"
            }`}
          >
            {lifecycle.label}
          </span>
        ) : null}
      </span>
      <MessageCircle
        className={`h-5 w-5 shrink-0 ${past ? "text-slate-400" : "text-[#001F3F]"}`}
        aria-hidden
      />
    </Link>
  );
}

function ConversationSection({
  title,
  rows,
  nowMs,
  chatHref,
  emptyPartnerLabel
}: {
  title: string;
  rows: BookingChatInboxRow[];
  nowMs: number;
  chatHref: (bookingId: string) => string;
  emptyPartnerLabel: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-right text-sm font-bold text-navy-header">{title}</h2>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.booking_id}>
            <ConversationCard
              row={row}
              lifecycle={chatLifecycleFromInboxRow(row, nowMs)}
              chatHref={chatHref}
              emptyPartnerLabel={emptyPartnerLabel}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

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
  const nowMs = Date.now();

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

  const grouped = useMemo(() => {
    const active: BookingChatInboxRow[] = [];
    const past: BookingChatInboxRow[] = [];
    for (const row of inbox) {
      const lifecycle = chatLifecycleFromInboxRow(row, nowMs);
      if (lifecycle.section === "active") active.push(row);
      else past.push(row);
    }
    const byRecent = (a: BookingChatInboxRow, b: BookingChatInboxRow) =>
      Date.parse(b.last_message_at) - Date.parse(a.last_message_at);
    active.sort(byRecent);
    past.sort(byRecent);
    return { active, past };
  }, [inbox, nowMs]);

  return (
    <>
      <div className="space-y-2">
        <PageBackRow>
          <PageBackLink href={dashboardHref} />
        </PageBackRow>
        <h1 className="text-right text-lg font-bold text-navy-header">הודעות</h1>
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
        <div className="space-y-5">
          <ConversationSection
            title="שיחות פתוחות"
            rows={grouped.active}
            nowMs={nowMs}
            chatHref={chatHref}
            emptyPartnerLabel={emptyPartnerLabel}
          />
          <ConversationSection
            title="שיחות קודמות"
            rows={grouped.past}
            nowMs={nowMs}
            chatHref={chatHref}
            emptyPartnerLabel={emptyPartnerLabel}
          />
        </div>
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
