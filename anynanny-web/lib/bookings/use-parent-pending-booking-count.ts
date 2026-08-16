"use client";

import { useCallback, useEffect, useState } from "react";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { fetchParentPendingSitterApprovalCount } from "@/lib/bookings/parent-pending-bookings";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";

/** Live count of pending sitter-approval requests for the parent calendar dashboard badge. */
export function useParentPendingBookingCount(parentId: string | null, enabled = true): number {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!parentId || !enabled) {
      setCount(0);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const next = await fetchParentPendingSitterApprovalCount(supabase, parentId);
    setCount(next);
  }, [parentId, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!parentId || !enabled) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = subscribePostgresChanges(supabase, `parent-pending-count-${parentId}`, {
      event: "*",
      table: BOOKINGS_TABLE,
      filter: `parent_id=eq.${parentId}`,
      handler: () => {
        void refresh();
      }
    });

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [parentId, enabled, refresh]);

  return count;
}
