"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarX2,
  Clock3,
  Megaphone,
  MessageCircle,
  Wallet,
  X
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { NOTIFICATIONS_TABLE } from "@/lib/chat/constants";
import {
  applyOperationalEventPopupChange,
  coordinationBookingHref,
  coordinationChatHref,
  coordinationScheduleLabel,
  fetchUnreadAdminBroadcastNotifications,
  isAdminBroadcastNotificationKind,
  isCoordinationNotificationKind,
  isGlobalOperationalNotificationKind,
  operationalCardActionLabel,
  OPERATIONAL_EVENT_POPUP_DURATION_MS,
  type CoordinationNotification
} from "@/lib/notifications/coordination";
import { isOperationalCardsSuppressedRoute } from "@/lib/notifications/operational-card-routes";
import { markNotificationsReadBestEffort } from "@/lib/notifications/read-state";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";

function toneForKind(kind: CoordinationNotification["kind"]): "emerald" | "amber" | "rose" {
  if (isAdminBroadcastNotificationKind(kind)) return "amber";
  if (
    kind === "booking_approved" ||
    kind === "shift_confirmed" ||
    kind === "booking_cancellation_approved" ||
    kind === "payment_received" ||
    kind === "manual_payment_confirmed"
  ) {
    return "emerald";
  }
  if (
    kind === "booking_rejected" ||
    kind === "booking_cancellation_requested" ||
    kind === "pending_booking_expired" ||
    kind === "booking_withdrawn_by_parent" ||
    kind === "manual_payment_denied"
  ) {
    return "rose";
  }
  return "amber";
}

const TONE_CLASS = {
  emerald: "border-emerald-300 bg-emerald-50 text-emerald-950",
  amber: "border-amber-300 bg-amber-50 text-amber-950",
  rose: "border-rose-300 bg-rose-50 text-rose-950"
} as const;

function IconForKind({ kind }: { kind: CoordinationNotification["kind"] }) {
  const className = "mt-0.5 h-5 w-5 shrink-0";
  if (isAdminBroadcastNotificationKind(kind)) {
    return <Megaphone className={className} aria-hidden />;
  }
  if (kind === "booking_rejected" || kind === "booking_withdrawn_by_parent") {
    return <CalendarX2 className={className} aria-hidden />;
  }
  if (
    kind === "manual_payment_confirmed" ||
    kind === "manual_payment_denied" ||
    kind === "manual_payment_resolved_reported" ||
    kind === "payment_received"
  ) {
    return <Wallet className={className} aria-hidden />;
  }
  if (kind === "missed_shift_clarification") {
    return <AlertTriangle className={className} aria-hidden />;
  }
  if (kind === "shift_end_reminder") {
    return <Clock3 className={className} aria-hidden />;
  }
  return <CalendarCheck2 className={className} aria-hidden />;
}

const ICON_BUTTON =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-current/70 transition hover:bg-white/70 hover:text-current";

export function GlobalCoordinationNotifications() {
  const { signedIn, user, isLoading, currentRole, effectiveRole } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const dismissTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [items, setItems] = useState<CoordinationNotification[]>([]);

  const userId = signedIn && user?.id ? user.id : null;
  const role: "parent" | "sitter" =
    effectiveRole === "sitter" || effectiveRole === "parent" ? effectiveRole : currentRole;

  const clearDismissTimer = useCallback((id: string) => {
    const timer = dismissTimersRef.current.get(id);
    if (timer) clearTimeout(timer);
    dismissTimersRef.current.delete(id);
  }, []);

  const dismissPopup = useCallback(
    (id: string, options?: { markRead?: boolean; kind?: CoordinationNotification["kind"] }) => {
      clearDismissTimer(id);
      setItems((prev) => prev.filter((row) => row.id !== id));
      if (options?.markRead && userId && isAdminBroadcastNotificationKind(options.kind)) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          void markNotificationsReadBestEffort(supabase, userId, { ids: [id] });
        }
      }
    },
    [clearDismissTimer, userId]
  );

  const scheduleDismiss = useCallback(
    (id: string, kind?: string) => {
      if (isAdminBroadcastNotificationKind(kind)) return;
      if (dismissTimersRef.current.has(id)) return;
      const timer = setTimeout(() => {
        dismissTimersRef.current.delete(id);
        setItems((prev) => prev.filter((row) => row.id !== id));
      }, OPERATIONAL_EVENT_POPUP_DURATION_MS);
      dismissTimersRef.current.set(id, timer);
    },
    []
  );

  useEffect(() => {
    setItems([]);
    for (const timer of dismissTimersRef.current.values()) clearTimeout(timer);
    dismissTimersRef.current.clear();
  }, [userId]);

  useEffect(() => {
    if (!isOperationalCardsSuppressedRoute(pathname)) return;
    setItems((prev) => prev.filter((row) => isAdminBroadcastNotificationKind(row.kind)));
    for (const [id, timer] of [...dismissTimersRef.current.entries()]) {
      clearTimeout(timer);
      dismissTimersRef.current.delete(id);
    }
  }, [pathname]);

  useEffect(() => {
    if (!userId || isLoading) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;
    void fetchUnreadAdminBroadcastNotifications(supabase, userId).then((result) => {
      if (cancelled || result.error) return;
      setItems((prev) => {
        const byId = new Map(prev.map((row) => [row.id, row]));
        for (const row of result.notifications) byId.set(row.id, row);
        return [...byId.values()];
      });
    });

    return () => {
      cancelled = true;
    };
  }, [userId, isLoading]);

  useEffect(() => {
    if (!userId || isLoading) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = subscribePostgresChanges(
      supabase,
      `coordination-notifications-${userId}`,
      {
        event: "INSERT",
        table: NOTIFICATIONS_TABLE,
        filter: `user_id=eq.${userId}`,
        handler: (payload) => {
          const kind = String((payload.new as { kind?: unknown } | null)?.kind ?? "");
          if (kind && !isGlobalOperationalNotificationKind(kind)) return;
          setItems((prev) => {
            const next = applyOperationalEventPopupChange(prev, payload, pathnameRef.current);
            for (const row of next) {
              if (!prev.some((existing) => existing.id === row.id)) {
                scheduleDismiss(row.id, row.kind);
              }
            }
            return next;
          });
        }
      }
    );

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [userId, isLoading, scheduleDismiss]);

  const openHref = useCallback(
    async (item: CoordinationNotification, href: string) => {
      if (!userId) return;
      dismissPopup(item.id);
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        await markNotificationsReadBestEffort(supabase, userId, {
          ids: [item.id],
          kind: item.kind,
          bookingId: String(item.payload.booking_id ?? "").trim() || undefined
        });
      }
      router.push(href);
    },
    [userId, router, dismissPopup]
  );

  const visibleItems = isOperationalCardsSuppressedRoute(pathname)
    ? items.filter((row) => isAdminBroadcastNotificationKind(row.kind))
    : items;

  if (!userId || visibleItems.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-20 z-[60] px-3 pt-2 sm:px-4"
      dir="rtl"
      aria-live="polite"
    >
      <div className="pointer-events-none mx-auto flex max-h-[min(38vh,18rem)] w-full max-w-md flex-col gap-2 overflow-y-auto overscroll-y-contain sm:mx-0 sm:ms-4 sm:me-auto">
        {visibleItems.map((item) => {
          const tone = toneForKind(item.kind);
          const schedule = coordinationScheduleLabel(item.payload);
          const bookingHref = coordinationBookingHref(item.kind, role, item.payload);
          const chatHref = isCoordinationNotificationKind(item.kind)
            ? coordinationChatHref(role, item.payload)
            : null;

          return (
            <article
              key={item.id}
              role="status"
              className={`pointer-events-auto rounded-2xl border p-3 text-right shadow-md ${TONE_CLASS[tone]}`}
            >
              <div className="flex flex-row-reverse items-start gap-1">
                <button
                  type="button"
                  aria-label="סגור"
                  className={ICON_BUTTON}
                  onClick={() =>
                    dismissPopup(item.id, { markRead: true, kind: item.kind })
                  }
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
                <div className="flex min-w-0 flex-1 flex-row-reverse items-start gap-2">
                  <IconForKind kind={item.kind} />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-bold leading-snug">{item.title}</h2>
                    {schedule ? (
                      <p className="mt-1 text-[12px] font-medium tabular-nums text-current/80">{schedule}</p>
                    ) : null}
                    {item.body && item.body !== item.title ? (
                      <p className="mt-1 break-words text-[12px] leading-snug text-current/75">{item.body}</p>
                    ) : null}
                    <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
                      {chatHref ? (
                        <button
                          type="button"
                          className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-current/20 bg-white/80 px-2.5 text-[12px] font-semibold"
                          onClick={() => void openHref(item, chatHref)}
                        >
                          <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                          פתח צ׳אט
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex min-h-11 items-center rounded-xl bg-[#001F3F] px-3 text-[12px] font-bold text-white"
                        onClick={() => void openHref(item, bookingHref)}
                      >
                        {operationalCardActionLabel(item.kind, item.payload)}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
