"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { MessageCircle, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { BookingScheduleText } from "@/components/bookings/booking-schedule-label";
import { DeleteConversationDialog } from "@/components/chat/delete-conversation-dialog";
import { PageBackLink, PageBackRow } from "@/components/navigation/page-back-link";
import {
  fetchBookingChatInboxForRole,
  hideBookingChatForUser,
  type BookingChatInboxRow
} from "@/lib/chat/booking-messages";
import { chatLifecycleFromInboxRow, type ChatLifecycle } from "@/lib/chat/chat-lifecycle";
import { chatInboxListMaxHeight } from "@/lib/chat/inbox-list-layout";
import { conversationMatchesInboxQuery, inboxSearchHasNoMatches } from "@/lib/chat/inbox-search";
import {
  activeSwipeFrame,
  shouldClaimHorizontalTouch,
  SWIPE_DEADZONE_PX,
  SWIPE_MAX_DRAG_PX,
  swipeOffsetPx,
  swipeReleaseAction,
  type SwipeAxis
} from "@/lib/chat/swipe-to-delete";
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
  tourAnchor?: string;
};

function ConversationCard({
  row,
  lifecycle,
  chatHref,
  emptyPartnerLabel,
  snapBackSignal,
  onRequestDelete
}: {
  row: BookingChatInboxRow;
  lifecycle: ChatLifecycle;
  chatHref: (bookingId: string) => string;
  emptyPartnerLabel: string;
  snapBackSignal: number;
  onRequestDelete: () => void;
}) {
  const past = lifecycle.section === "past";
  const cancelled = lifecycle.kind === "cancelled";
  const completed = lifecycle.kind === "completed";
  const partnerLabel = row.partner_name ?? emptyPartnerLabel;
  const surfaceRef = useRef<HTMLLIElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const axisRef = useRef<SwipeAxis>("undecided");
  const suppressClickRef = useRef(false);
  const onRequestDeleteRef = useRef(onRequestDelete);
  onRequestDeleteRef.current = onRequestDelete;

  const paintOffset = useCallback((px: number, animate: boolean) => {
    const node = cardRef.current;
    if (!node) return;
    node.style.transition = animate ? "transform 200ms ease-out" : "none";
    node.style.transform = `translate3d(${px}px, 0, 0)`;
  }, []);

  const resetTracking = useCallback(() => {
    startRef.current = null;
    axisRef.current = "undecided";
  }, []);

  useEffect(() => {
    paintOffset(0, true);
    resetTracking();
  }, [snapBackSignal, paintOffset, resetTracking]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      startRef.current = { x: touch.clientX, y: touch.clientY };
      axisRef.current = "undecided";
      suppressClickRef.current = false;
    };

    const onTouchMove = (event: TouchEvent) => {
      const start = startRef.current;
      if (!start || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const frame = activeSwipeFrame(dx, dy, axisRef.current);
      if (frame.axis === "vertical") {
        suppressClickRef.current = true;
        resetTracking();
        paintOffset(0, true);
        return;
      }
      if (shouldClaimHorizontalTouch(dx, dy, axisRef.current) && event.cancelable) {
        event.preventDefault();
      }
      axisRef.current = frame.axis;
      if (!frame.blockScroll) return;
      paintOffset(frame.offsetPx, false);
    };

    const finishTouch = (event: TouchEvent, cancelled: boolean) => {
      const start = startRef.current;
      const axis = axisRef.current;
      if (!start) return;
      const touch = event.changedTouches[0];
      const dx = touch ? touch.clientX - start.x : 0;
      resetTracking();
      if (!cancelled && axis === "horizontal" && swipeReleaseAction(dx) === "confirm") {
        suppressClickRef.current = true;
        paintOffset(swipeOffsetPx(dx), true);
        onRequestDeleteRef.current();
        return;
      }
      if (axis === "horizontal" && Math.abs(dx) >= SWIPE_DEADZONE_PX) {
        suppressClickRef.current = true;
      }
      paintOffset(0, true);
    };

    const onTouchEnd = (event: TouchEvent) => finishTouch(event, false);
    const onTouchCancel = (event: TouchEvent) => finishTouch(event, true);

    // React pointer events stay passive, so the page scroller takes the touch
    // before pointermove can slide the card. A non-passive touchmove can
    // claim a clearly horizontal drag and let the card follow the finger.
    surface.addEventListener("touchstart", onTouchStart, { passive: true });
    surface.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    surface.addEventListener("touchend", onTouchEnd);
    surface.addEventListener("touchcancel", onTouchCancel);
    return () => {
      surface.removeEventListener("touchstart", onTouchStart);
      surface.removeEventListener("touchmove", onTouchMove, { capture: true });
      surface.removeEventListener("touchend", onTouchEnd);
      surface.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [paintOffset, resetTracking]);

  const onPointerDown = (event: PointerEvent<HTMLLIElement>) => {
    if (event.pointerType === "touch" || event.button !== 0) return;
    startRef.current = { x: event.clientX, y: event.clientY };
    axisRef.current = "undecided";
    suppressClickRef.current = false;
  };

  const onPointerMove = (event: PointerEvent<HTMLLIElement>) => {
    if (event.pointerType === "touch") return;
    const start = startRef.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const frame = activeSwipeFrame(dx, dy, axisRef.current);
    if (frame.axis === "vertical") {
      resetTracking();
      paintOffset(0, true);
      return;
    }
    axisRef.current = frame.axis;
    if (!frame.blockScroll) return;
    paintOffset(frame.offsetPx, false);
  };

  const endPointer = (event: PointerEvent<HTMLLIElement>, cancelled: boolean) => {
    if (event.pointerType === "touch") return;
    const start = startRef.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const axis = axisRef.current;
    resetTracking();
    if (!cancelled && axis === "horizontal" && swipeReleaseAction(dx) === "confirm") {
      suppressClickRef.current = true;
      paintOffset(swipeOffsetPx(dx), true);
      onRequestDeleteRef.current();
      return;
    }
    if (axis === "horizontal" && Math.abs(dx) >= SWIPE_DEADZONE_PX) {
      suppressClickRef.current = true;
    }
    paintOffset(0, true);
  };

  return (
    <li
      ref={surfaceRef}
      className="relative overflow-hidden rounded-2xl"
      style={{ touchAction: "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => endPointer(event, false)}
      onPointerCancel={(event) => endPointer(event, true)}
    >
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-0 flex items-center justify-center bg-rose-600 text-white"
        style={{ width: SWIPE_MAX_DRAG_PX }}
        aria-hidden
      >
        <Trash2 className="h-5 w-5" />
      </div>
      <div ref={cardRef} className="relative z-10">
        <div className="group relative">
          <Link
            href={chatHref(row.booking_id)}
            draggable={false}
            onClick={(event) => {
              if (suppressClickRef.current) {
                event.preventDefault();
                suppressClickRef.current = false;
              }
            }}
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
                  {partnerLabel}
                </span>
                {row.partner_public_id ? (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-slate-600 ring-1 ring-slate-200/80">
                    {row.partner_public_id} ID
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                <BookingScheduleText label={row.schedule_label} />
              </span>
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
          <button
            type="button"
            aria-label={`מחיקת השיחה עם ${partnerLabel}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRequestDelete();
            }}
            className="pointer-events-none absolute left-1 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-rose-700 opacity-0 transition hover:bg-rose-50 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 [@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:opacity-100"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </li>
  );
}

function ConversationSection({
  title,
  rows,
  nowMs,
  chatHref,
  emptyPartnerLabel,
  snapBackSignal,
  onRequestDelete
}: {
  title: string;
  rows: BookingChatInboxRow[];
  nowMs: number;
  chatHref: (bookingId: string) => string;
  emptyPartnerLabel: string;
  snapBackSignal: number;
  onRequestDelete: (row: BookingChatInboxRow) => void;
}) {
  const headingId = useId();
  if (rows.length === 0) return null;
  return (
    <section className="min-w-0 space-y-2" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-right text-sm font-bold text-navy-header">
        {title}
      </h2>
      <ul
        data-chat-list-scroll=""
        className="space-y-2 overflow-x-hidden overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] [scrollbar-color:rgb(148_163_184/0.45)_transparent] [scrollbar-width:thin]"
        style={{ maxHeight: chatInboxListMaxHeight() }}
      >
        {rows.map((row) => (
          <ConversationCard
            key={row.booking_id}
            row={row}
            lifecycle={chatLifecycleFromInboxRow(row, nowMs)}
            chatHref={chatHref}
            emptyPartnerLabel={emptyPartnerLabel}
            snapBackSignal={snapBackSignal}
            onRequestDelete={() => onRequestDelete(row)}
          />
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
  emptyActionLabel,
  tourAnchor
}: BookingChatInboxProps) {
  const { isLoading, signedIn, effectiveRole } = useAuth();
  const searchId = useId();
  const [inbox, setInbox] = useState<BookingChatInboxRow[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<BookingChatInboxRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [snapBackSignal, setSnapBackSignal] = useState(0);
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

  const filtered = useMemo(
    () => ({
      active: grouped.active.filter((row) => conversationMatchesInboxQuery(row, query)),
      past: grouped.past.filter((row) => conversationMatchesInboxQuery(row, query))
    }),
    [grouped, query]
  );
  const noMatches = inboxSearchHasNoMatches(query, filtered.active.length + filtered.past.length);

  const requestDelete = useCallback((row: BookingChatInboxRow) => {
    setDeleteError(null);
    setPendingDelete(row);
  }, []);

  const cancelDelete = useCallback(() => {
    if (deleteBusy) return;
    setPendingDelete(null);
    setDeleteError(null);
    setSnapBackSignal((value) => value + 1);
  }, [deleteBusy]);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete || deleteBusy) return;
    const auth = await resolveBrowserAuth();
    if (!auth.ok) {
      setDeleteError("יש להתחבר מחדש");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setDeleteError("לא הצלחנו להסתיר את השיחה. נסו שוב.");
      return;
    }

    setDeleteBusy(true);
    const { error } = await hideBookingChatForUser(supabase, pendingDelete.booking_id, auth.userId);
    setDeleteBusy(false);
    if (error) {
      setDeleteError(error);
      return;
    }

    const removedId = pendingDelete.booking_id;
    setInbox((current) => current.filter((row) => row.booking_id !== removedId));
    setPendingDelete(null);
    setDeleteError(null);
  }, [deleteBusy, pendingDelete]);

  return (
    <>
      <div {...(tourAnchor ? { "data-tour": tourAnchor } : {})} className="space-y-2">
        <PageBackRow>
          <PageBackLink href={dashboardHref} />
        </PageBackRow>
        <h1 className="text-right text-lg font-bold text-navy-header">הודעות</h1>
      </div>

      {loadingInbox ? (
        <p className="text-right text-sm text-slate-600">טוען שיחות…</p>
      ) : (
        <>
          <div>
            <label htmlFor={searchId} className="sr-only">
              חיפוש לפי שם או ID
            </label>
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="חיפוש לפי שם או ID"
              aria-label="חיפוש לפי שם או ID"
              autoComplete="off"
              className="w-full rounded-xl border border-navy-header/15 bg-white px-3 py-2 text-right text-sm text-navy-header outline-none ring-navy-header/20 placeholder:text-slate-400 focus:ring-2"
            />
          </div>

          {inbox.length === 0 && !query.trim() ? (
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
          ) : noMatches ? (
            <p
              className="rounded-2xl border border-navy-header/10 bg-white px-4 py-6 text-center text-sm font-medium text-slate-600 shadow-sm"
              role="status"
            >
              לא נמצאה שיחה מתאימה
            </p>
          ) : (
            <div className="min-w-0 space-y-5">
              <ConversationSection
                title="שיחות פתוחות"
                rows={filtered.active}
                nowMs={nowMs}
                chatHref={chatHref}
                emptyPartnerLabel={emptyPartnerLabel}
                snapBackSignal={snapBackSignal}
                onRequestDelete={requestDelete}
              />
              <ConversationSection
                title="שיחות קודמות"
                rows={filtered.past}
                nowMs={nowMs}
                chatHref={chatHref}
                emptyPartnerLabel={emptyPartnerLabel}
                snapBackSignal={snapBackSignal}
                onRequestDelete={requestDelete}
              />
            </div>
          )}
        </>
      )}

      <DeleteConversationDialog
        open={pendingDelete !== null}
        busy={deleteBusy}
        error={deleteError}
        onClose={cancelDelete}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
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
      tourAnchor="messages-chat"
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
      tourAnchor="sitter-messages-chat"
    />
  );
}
