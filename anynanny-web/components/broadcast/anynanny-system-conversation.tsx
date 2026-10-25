"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import {
  ANYNANNY_SYSTEM_CONVERSATION_TITLE,
  BROADCAST_REMOVED_EVENT,
  BROADCAST_TALKS_HREF,
  loadSystemTalkItems,
  systemConversationVisible
} from "@/lib/broadcast/system-talks";
import { BROADCAST_QUESTION_ANSWERED_EVENT } from "@/lib/broadcast/question-link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function AnynannySystemConversation() {
  const { signedIn, user, effectiveRole } = useAuth();
  const userId = signedIn && user?.id ? user.id : null;
  const role = effectiveRole === "sitter" ? "sitter" : "parent";
  const [count, setCount] = useState(0);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      setPending(0);
      return;
    }
    let cancelled = false;
    const load = () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      void loadSystemTalkItems(supabase, userId, role).then((result) => {
        if (cancelled) return;
        setCount(result.items.length);
        setPending(result.items.filter((item) => item.pending).length);
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
  }, [userId, role]);

  if (!systemConversationVisible(count)) return null;

  return (
    <Link
      href={BROADCAST_TALKS_HREF}
      data-anynanny-system-conversation
      className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-[#001F3F]/10 bg-white px-3 py-3 text-right shadow-sm"
    >
      <span className="min-w-0">
        <span className="block text-sm font-bold text-[#001F3F]">{ANYNANNY_SYSTEM_CONVERSATION_TITLE}</span>
        <span className="mt-0.5 block text-xs text-[#001F3F]/70">הודעות ושאלונים מ-AnyNanny</span>
      </span>
      {pending > 0 ? (
        <span
          data-system-talk-badge
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white"
          dir="ltr"
        >
          {pending > 9 ? "9+" : pending}
        </span>
      ) : null}
    </Link>
  );
}
