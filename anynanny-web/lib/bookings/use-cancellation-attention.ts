"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  acknowledgeBookingCancellation,
  approveBookingCancellation,
  type CancellationRequesterRole
} from "@/lib/bookings/cancellation-request";
import {
  fetchCancellationAttentionItems,
  type CancellationAttentionItem
} from "@/lib/bookings/cancellation-attention";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";

export function useCancellationAttention(
  userId: string | null | undefined,
  role: CancellationRequesterRole,
  enabled = true,
  onMutated?: () => void
) {
  const [items, setItems] = useState<CancellationAttentionItem[]>([]);
  const [sessionDismissedIds, setSessionDismissedIds] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onMutatedRef = useRef(onMutated);
  onMutatedRef.current = onMutated;

  const refresh = useCallback(async () => {
    if (!userId || !enabled) {
      setItems([]);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const result = await fetchCancellationAttentionItems(supabase, userId, role);
    if (result.error) {
      console.warn("[cancellation-attention]", result.error);
    }
    setItems(result.items);
  }, [userId, role, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId || !enabled) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const filterColumn = role === "parent" ? "parent_id" : "sitter_id";
    const channel = subscribePostgresChanges(supabase, `cancellation-attention-${role}-${userId}`, {
      event: "*",
      table: BOOKINGS_TABLE,
      filter: `${filterColumn}=eq.${userId}`,
      handler: () => {
        void refresh();
      }
    });

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [userId, role, enabled, refresh]);

  const showDot = useMemo(
    () => items.some((item) => item.kind === "incoming" || item.kind === "approved"),
    [items]
  );

  const activeItem = useMemo(() => {
    return items.find((item) => item.kind === "approved" || !sessionDismissedIds.has(item.id)) ?? null;
  }, [items, sessionDismissedIds]);

  const incomingItem = activeItem?.kind === "incoming" ? activeItem : null;
  const approvedItem = activeItem?.kind === "approved" ? activeItem : null;

  const dismissIncomingForNow = useCallback((bookingId: string) => {
    setSessionDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(bookingId);
      return next;
    });
    setError(null);
  }, []);

  const approveIncoming = useCallback(
    async (bookingId: string) => {
      if (busy) return false;
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setError("Supabase לא זמין");
        return false;
      }
      setBusy(true);
      setError(null);
      const result = await approveBookingCancellation(supabase, bookingId);
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      await refresh();
      onMutatedRef.current?.();
      return true;
    },
    [busy, refresh]
  );

  const acknowledgeApproved = useCallback(
    async (bookingId: string) => {
      if (busy) return false;
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setError("Supabase לא זמין");
        return false;
      }
      setBusy(true);
      setError(null);
      const result = await acknowledgeBookingCancellation(supabase, bookingId);
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      await refresh();
      onMutatedRef.current?.();
      return true;
    },
    [busy, refresh]
  );

  return {
    items,
    showDot,
    incomingItem,
    approvedItem,
    busy,
    error,
    refresh,
    dismissIncomingForNow,
    approveIncoming,
    acknowledgeApproved
  };
}

export type CancellationAttentionState = ReturnType<typeof useCancellationAttention>;
