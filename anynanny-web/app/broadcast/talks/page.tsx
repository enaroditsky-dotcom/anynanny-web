"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { NannyTalksFrame } from "@/components/broadcast/nanny-talks-frame";
import {
  ANYNANNY_SYSTEM_CONVERSATION_TITLE,
  EXPLICIT_BROADCAST_REMOVAL_LABEL,
  loadSystemTalkItems,
  removeOwnRegularBroadcast,
  type SystemTalkItem
} from "@/lib/broadcast/system-talks";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function BroadcastTalksPage() {
  const { isLoading, signedIn, user, effectiveRole } = useAuth();
  const userId = signedIn && user?.id ? user.id : null;
  const role = effectiveRole === "sitter" ? "sitter" : "parent";
  const [items, setItems] = useState<SystemTalkItem[]>([]);
  const [selected, setSelected] = useState<SystemTalkItem | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !userId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void loadSystemTalkItems(supabase, userId, role).then((result) => {
      setItems(result.items);
      setError(result.error);
    });
  }, [isLoading, userId, role]);

  const removeSelected = async () => {
    if (!selected || selected.kind !== "broadcast" || !userId || removing) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setRemoving(true);
    const result = await removeOwnRegularBroadcast(supabase, userId, selected.id);
    setRemoving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setItems((current) => current.filter((item) => item.id !== selected.id));
    setSelected(null);
  };

  return (
    <main className="mx-auto w-full max-w-lg space-y-3 px-3 py-4 text-right" dir="rtl">
      <h1 className="text-2xl font-semibold text-[#001F3F]">{ANYNANNY_SYSTEM_CONVERSATION_TITLE}</h1>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {items.length === 0 ? <p className="text-sm text-[#001F3F]/70">אין הודעות פעילות.</p> : null}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={`${item.kind}-${item.id}`}>
            {item.kind === "question" ? (
              <Link href={item.href} className="block rounded-2xl border border-[#001F3F]/10 bg-white p-3 text-sm font-semibold text-[#001F3F]">
                {item.title}
              </Link>
            ) : (
              <button
                type="button"
                className="block w-full rounded-2xl border border-[#001F3F]/10 bg-white p-3 text-right text-sm font-semibold text-[#001F3F]"
                onClick={() => setSelected(item)}
              >
                {item.title}
              </button>
            )}
          </li>
        ))}
      </ul>
      {selected ? (
        <NannyTalksFrame title="AnyNanny" onDismiss={() => setSelected(null)}>
          <p className="whitespace-pre-wrap text-base leading-relaxed">{selected.title}</p>
          {selected.href.startsWith("/") ? (
            <Link href={selected.href} className="mt-3 inline-flex min-h-11 items-center text-sm font-bold underline">
              לפתיחה
            </Link>
          ) : null}
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-md border border-neutral-300 bg-neutral-100 px-4 text-sm font-semibold"
              disabled={removing}
              onClick={() => void removeSelected()}
            >
              {removing ? "מסיר…" : EXPLICIT_BROADCAST_REMOVAL_LABEL}
            </button>
          </div>
        </NannyTalksFrame>
      ) : null}
    </main>
  );
}
