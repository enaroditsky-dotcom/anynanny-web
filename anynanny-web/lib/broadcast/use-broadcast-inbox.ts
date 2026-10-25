"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { BROADCAST_REMOVED_EVENT } from "@/lib/broadcast/system-talks";
import { BROADCAST_QUESTION_ANSWERED_EVENT } from "@/lib/broadcast/question-link";
import { useUnansweredBroadcastQuestions } from "@/lib/broadcast/use-unanswered-questions";
import { fetchUnreadAdminBroadcastNotifications } from "@/lib/notifications/coordination";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { broadcastPendingBadge } from "@/lib/broadcast/system-talks";

export function useBroadcastMessagesBadge(): string | null {
  const { signedIn, user } = useAuth();
  const userId = signedIn && user?.id ? user.id : null;
  const { count } = useUnansweredBroadcastQuestions();
  const [regularCount, setRegularCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setRegularCount(0);
      return;
    }
    let cancelled = false;
    const load = () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      void fetchUnreadAdminBroadcastNotifications(supabase, userId).then((result) => {
        if (cancelled) return;
        setRegularCount(result.notifications.length);
      });
    };
    load();
    const onChange = () => load();
    window.addEventListener(BROADCAST_REMOVED_EVENT, onChange);
    window.addEventListener(BROADCAST_QUESTION_ANSWERED_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(BROADCAST_REMOVED_EVENT, onChange);
      window.removeEventListener(BROADCAST_QUESTION_ANSWERED_EVENT, onChange);
    };
  }, [userId]);

  if (!userId) return null;
  return broadcastPendingBadge(count, regularCount);
}
