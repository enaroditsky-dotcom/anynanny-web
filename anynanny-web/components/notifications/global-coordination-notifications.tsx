"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, CalendarX2, MessageCircle, X } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { NOTIFICATIONS_TABLE } from "@/lib/chat/constants";
import {
  applyCoordinationRealtimeChange,
  coordinationBookingHref,
  coordinationChatHref,
  coordinationScheduleLabel,
  fetchUnreadCoordinationNotifications,
  isCoordinationNotificationKind,
  type CoordinationNotification
} from "@/lib/notifications/coordination";
import { markNotificationsReadBestEffort } from "@/lib/notifications/read-state";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";

function toneForKind(kind: CoordinationNotification["kind"]): "emerald" | "amber" | "rose" {
  if (kind === "booking_approved" || kind === "shift_confirmed" || kind === "booking_cancellation_approved") {
    return "emerald";
  }
  if (
    kind === "booking_rejected" ||
    kind === "booking_cancellation_requested" ||
    kind === "pending_booking_expired" ||
    kind === "booking_withdrawn_by_parent"
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

export function GlobalCoordinationNotifications() {
  const { signedIn, user, isLoading, currentRole, effectiveRole } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<CoordinationNotification[]>([]);

  const userId = signedIn && user?.id ? user.id : null;
  const role: "parent" | "sitter" =
    effectiveRole === "sitter" || effectiveRole === "parent" ? effectiveRole : currentRole;

  const reload = useCallback(async () => {
    if (!userId) {
      setItems([]);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const result = await fetchUnreadCoordinationNotifications(supabase, userId);
    if (result.error) {
      console.warn("[coordination-notifications]", result.error);
      return;
    }
    setItems(result.notifications);
  }, [userId]);

  useEffect(() => {
    if (isLoading) return;
    void reload();
  }, [isLoading, reload]);

  useEffect(() => {
    if (!userId || isLoading) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = subscribePostgresChanges(
      supabase,
      `coordination-notifications-${userId}`,
      {
        event: "*",
        table: NOTIFICATIONS_TABLE,
        filter: `user_id=eq.${userId}`,
        handler: (payload) => {
          const kind = String((payload.new as { kind?: unknown } | null)?.kind ?? "");
          if (kind && !isCoordinationNotificationKind(kind) && payload.eventType !== "DELETE") {
            return;
          }
          setItems((prev) => applyCoordinationRealtimeChange(prev, payload));
        }
      },
      (status) => {
        if (status === "SUBSCRIBED") {
          void reload();
        }
      }
    );

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [userId, isLoading, reload]);

  const acknowledge = useCallback(
    async (item: CoordinationNotification) => {
      if (!userId) return;
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      await markNotificationsReadBestEffort(supabase, userId, {
        ids: [item.id],
        kind: item.kind,
        bookingId: String(item.payload.booking_id ?? "").trim() || undefined
      });
    },
    [userId]
  );

  const openHref = useCallback(
    async (item: CoordinationNotification, href: string) => {
      await acknowledge(item);
      router.push(href);
    },
    [acknowledge, router]
  );

  if (!userId || items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-20 z-[60] px-4 pt-2"
      dir="rtl"
      aria-live="polite"
    >
      <div className="mx-auto flex max-h-[min(42vh,20rem)] w-full max-w-md flex-col gap-2 overflow-y-auto overscroll-y-contain">
        {items.map((item) => {
          const tone = toneForKind(item.kind);
          const schedule = coordinationScheduleLabel(item.payload);
          const bookingHref = coordinationBookingHref(item.kind, role, item.payload);
          const chatHref = coordinationChatHref(role, item.payload);
          const Icon =
            item.kind === "booking_rejected" || item.kind === "booking_withdrawn_by_parent"
              ? CalendarX2
              : CalendarCheck2;

          return (
            <article
              key={item.id}
              role="status"
              className={`pointer-events-auto rounded-2xl border p-3 text-right shadow-md ${TONE_CLASS[tone]}`}
            >
              <div className="flex flex-row-reverse items-start gap-2">
                <button
                  type="button"
                  aria-label="סגור"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-current/70 transition hover:bg-white/70 hover:text-current"
                  onClick={() => void acknowledge(item)}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
                <div className="flex min-w-0 flex-1 flex-row-reverse items-start gap-2">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-bold leading-snug">{item.title}</h2>
                    {schedule ? (
                      <p className="mt-1 text-[12px] font-medium tabular-nums text-current/80">{schedule}</p>
                    ) : null}
                    {item.body && item.body !== item.title ? (
                      <p className="mt-1 text-[12px] leading-snug text-current/75">{item.body}</p>
                    ) : null}
                    <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
                      {chatHref ? (
                        <button
                          type="button"
                          className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-current/20 bg-white/80 px-2.5 text-[12px] font-semibold"
                          onClick={() => void openHref(item, chatHref)}
                        >
                          <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                          פתח צ׳אט
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex min-h-9 items-center rounded-xl bg-[#001F3F] px-3 text-[12px] font-bold text-white"
                        onClick={() => void openHref(item, bookingHref)}
                      >
                        למשמרת
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
