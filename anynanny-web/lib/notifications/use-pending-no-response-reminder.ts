"use client";

import { useCallback, useEffect, useState } from "react";
import { NOTIFICATIONS_TABLE } from "@/lib/chat/constants";
import {
  fetchUnreadPendingNoResponseReminder,
  markPendingNoResponseReminderRead,
  type PendingNoResponseReminder
} from "@/lib/notifications/pending-no-response-reminder";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";

export function usePendingNoResponseReminder(parentId: string | null, enabled = true) {
  const [reminder, setReminder] = useState<PendingNoResponseReminder | null>(null);

  const refresh = useCallback(async () => {
    if (!parentId || !enabled) {
      setReminder(null);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const result = await fetchUnreadPendingNoResponseReminder(supabase, parentId);
    if (result.error) {
      console.warn("[pending reminder]", result.error);
      return;
    }
    setReminder(result.reminder);
  }, [enabled, parentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!parentId || !enabled) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = subscribePostgresChanges(supabase, `parent-pending-reminder-${parentId}`, {
      event: "*",
      table: NOTIFICATIONS_TABLE,
      filter: `user_id=eq.${parentId}`,
      handler: () => {
        void refresh();
      }
    });

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [enabled, parentId, refresh]);

  const dismissLocal = useCallback((id: string) => {
    setReminder((prev) => (prev?.id === id ? null : prev));
  }, []);

  const markRead = useCallback(
    async (item: PendingNoResponseReminder) => {
      if (!parentId) return;
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      await markPendingNoResponseReminderRead(supabase, parentId, item);
      dismissLocal(item.id);
    },
    [dismissLocal, parentId]
  );

  return { reminder, refresh, markRead, dismissLocal };
}
