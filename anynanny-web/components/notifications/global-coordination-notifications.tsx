"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarX2,
  ChevronDown,
  ChevronUp,
  Clock3,
  MessageCircle,
  Wallet,
  X
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { NOTIFICATIONS_TABLE } from "@/lib/chat/constants";
import {
  applyCoordinationRealtimeChange,
  coordinationBookingHref,
  coordinationChatHref,
  coordinationScheduleLabel,
  fetchUnreadCoordinationNotifications,
  isCoordinationNotificationKind,
  isGlobalOperationalNotificationKind,
  operationalCardActionLabel,
  type CoordinationNotification
} from "@/lib/notifications/coordination";
import {
  readOperationalCardHiddenIds,
  readOperationalCardMinimizedIds,
  withOperationalCardId,
  writeOperationalCardHiddenIds,
  writeOperationalCardMinimizedIds
} from "@/lib/notifications/operational-card-session";
import {
  minimizedIdsAfterExpand,
  partitionOperationalCards
} from "@/lib/notifications/operational-card-stack";
import { markNotificationsReadBestEffort } from "@/lib/notifications/read-state";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";

function toneForKind(kind: CoordinationNotification["kind"]): "emerald" | "amber" | "rose" {
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
  const router = useRouter();
  const [items, setItems] = useState<CoordinationNotification[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [minimizedIds, setMinimizedIds] = useState<Set<string>>(() => new Set());

  const userId = signedIn && user?.id ? user.id : null;
  const role: "parent" | "sitter" =
    effectiveRole === "sitter" || effectiveRole === "parent" ? effectiveRole : currentRole;

  useEffect(() => {
    if (!userId) {
      setHiddenIds(new Set());
      setMinimizedIds(new Set());
      return;
    }
    setHiddenIds(readOperationalCardHiddenIds(userId));
    setMinimizedIds(readOperationalCardMinimizedIds(userId));
  }, [userId]);

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
          if (kind && !isGlobalOperationalNotificationKind(kind) && payload.eventType !== "DELETE") {
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

  const hideForSession = useCallback(
    (item: CoordinationNotification) => {
      if (!userId) return;
      setHiddenIds((prev) => {
        const next = withOperationalCardId(prev, item.id);
        writeOperationalCardHiddenIds(userId, next);
        return next;
      });
    },
    [userId]
  );

  const minimizeForSession = useCallback(
    (item: CoordinationNotification) => {
      if (!userId) return;
      setMinimizedIds((prev) => {
        const next = withOperationalCardId(prev, item.id);
        writeOperationalCardMinimizedIds(userId, next);
        return next;
      });
    },
    [userId]
  );

  const expandForSession = useCallback(
    (item: CoordinationNotification) => {
      if (!userId) return;
      setMinimizedIds((prev) => {
        const next = minimizedIdsAfterExpand(items, hiddenIds, prev, item.id);
        writeOperationalCardMinimizedIds(userId, next);
        return next;
      });
    },
    [userId, items, hiddenIds]
  );

  const openHref = useCallback(
    async (item: CoordinationNotification, href: string) => {
      if (!userId) return;
      setItems((prev) => prev.filter((row) => row.id !== item.id));
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
    [userId, router]
  );

  const stack = useMemo(
    () => partitionOperationalCards(items, hiddenIds, minimizedIds),
    [items, hiddenIds, minimizedIds]
  );

  if (!userId || (stack.expanded.length === 0 && stack.collapsed.length === 0 && stack.overflowCount === 0)) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-20 z-[60] px-3 pt-2 sm:px-4"
      dir="rtl"
      aria-live="polite"
    >
      <div className="pointer-events-none mx-auto flex max-h-[min(38vh,18rem)] w-full max-w-md flex-col gap-2 overflow-y-auto overscroll-y-contain sm:mx-0 sm:ms-4 sm:me-auto">
        {stack.expanded.map((item) => {
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
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    aria-label="הסתר כרגע"
                    className={ICON_BUTTON}
                    onClick={() => hideForSession(item)}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="מזער"
                    className={ICON_BUTTON}
                    onClick={() => minimizeForSession(item)}
                  >
                    <ChevronUp className="h-4 w-4" aria-hidden />
                  </button>
                </div>
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
                        {operationalCardActionLabel(item.kind)}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}

        {stack.collapsed.map((item) => {
          const tone = toneForKind(item.kind);
          return (
            <article
              key={item.id}
              role="status"
              className={`pointer-events-auto rounded-xl border px-2 py-1 text-right shadow-sm ${TONE_CLASS[tone]}`}
            >
              <div className="flex flex-row-reverse items-center gap-1">
                <button
                  type="button"
                  aria-label="הסתר כרגע"
                  className={ICON_BUTTON}
                  onClick={() => hideForSession(item)}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="הצג"
                  className={ICON_BUTTON}
                  onClick={() => expandForSession(item)}
                >
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center justify-end py-1 text-right"
                  onClick={() => expandForSession(item)}
                >
                  <span className="truncate text-[12px] font-bold leading-snug">{item.title}</span>
                </button>
              </div>
            </article>
          );
        })}

        {stack.overflowCount > 0 ? (
          <p className="pointer-events-none px-1 text-center text-[11px] font-semibold text-slate-500">
            עוד {stack.overflowCount} התראות
          </p>
        ) : null}
      </div>
    </div>
  );
}
