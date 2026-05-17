"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Send } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { fetchChatMessages, fetchChatRoom, sendChatMessage } from "@/lib/chat/parent-chat";
import type { ChatMessageRow } from "@/lib/chat/constants";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function ParentChatRoom({ roomId }: { roomId: string }) {
  const { user, signedIn, isLoading, effectiveRole } = useAuth();
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [counterpartyLabel, setCounterpartyLabel] = useState("הבייביסיטר");
  const [draft, setDraft] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "denied" | "error">("loading");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user?.id) {
      setLoadState("error");
      return;
    }

    const { room, error: roomError } = await fetchChatRoom(supabase, roomId);
    if (roomError || !room) {
      setLoadState("denied");
      return;
    }

    if (room.parent_id !== user.id) {
      setLoadState("denied");
      return;
    }

    const { data: sp } = await supabase
      .from("sitter_profiles")
      .select("full_name")
      .eq("id", room.sitter_id)
      .maybeSingle();

    const name =
      sp && typeof sp === "object" && "full_name" in sp
        ? String((sp as { full_name?: string }).full_name ?? "").trim()
        : "";
    setCounterpartyLabel(name || "הבייביסיטר");

    const { messages: rows, error: msgError } = await fetchChatMessages(supabase, roomId);
    if (msgError) {
      setLoadState("error");
      return;
    }

    setMessages(rows);
    setLoadState("ready");
  }, [roomId, user?.id]);

  useEffect(() => {
    if (isLoading || !signedIn || effectiveRole !== "parent") return;
    void load();
  }, [isLoading, signedIn, effectiveRole, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user?.id || !draft.trim()) return;

    setSending(true);
    setSendError(null);
    const { message, error } = await sendChatMessage(supabase, roomId, user.id, draft);
    setSending(false);

    if (error || !message) {
      setSendError(error ?? "לא ניתן לשלוח");
      return;
    }

    setDraft("");
    setMessages((prev) => [...prev, message]);
  };

  if (isLoading || !signedIn) {
    return <p className="px-1 text-right text-sm text-slate-600">טוען…</p>;
  }

  if (effectiveRole !== "parent") {
    return (
      <p className="px-1 text-right text-sm text-slate-600">שיחות זמינות להורים בלבד.</p>
    );
  }

  if (loadState === "denied") {
    return (
      <section className="rounded-2xl border border-navy-header/10 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-navy-900">השיחה לא נמצאה או שאין גישה.</p>
        <Link href="/parent/messages" className="mt-3 inline-block text-sm font-semibold text-emerald-800 underline">
          חזרה להודעות
        </Link>
      </section>
    );
  }

  if (loadState === "loading") {
    return <p className="px-1 text-right text-sm text-slate-600">טוען שיחה…</p>;
  }

  if (loadState === "error") {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-right text-sm text-rose-900">
        שגיאה בטעינת השיחה.
      </section>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col">
      <section className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-navy-header/10 bg-white p-4 shadow-sm">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-slate-500">אין הודעות עדיין. כתבו הודעה ראשונה ל{counterpartyLabel}.</p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    mine
                      ? "bg-[#001F3F] text-white"
                      : "border border-navy-header/10 bg-[#FDFBF6] text-slate-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  <time
                    className={`mt-1 block text-[10px] tabular-nums ${mine ? "text-white/70" : "text-slate-500"}`}
                    dateTime={m.created_at}
                  >
                    {new Date(m.created_at).toLocaleString("he-IL", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </time>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </section>

      {sendError ? (
        <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-right text-xs text-rose-900">
          {sendError}
        </p>
      ) : null}

      <form
        className="mt-3 flex flex-row-reverse items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
      >
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#001F3F] text-white transition hover:brightness-110 disabled:opacity-50"
          aria-label="שליחה"
        >
          <Send className="h-4 w-4" />
        </button>
        <label className="sr-only" htmlFor="chat-draft">
          הודעה
        </label>
        <textarea
          id="chat-draft"
          rows={2}
          value={draft}
          disabled={sending}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`הודעה ל${counterpartyLabel}…`}
          className="min-h-11 flex-1 resize-none rounded-2xl border border-navy-header/20 bg-white px-3 py-2 text-right text-sm text-slate-800 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#001F3F]"
        />
      </form>
    </div>
  );
}

export function ParentChatRoomHeader({ roomId, backHref }: { roomId: string; backHref: string }) {
  const [title, setTitle] = useState("שיחה");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    void (async () => {
      const { room } = await fetchChatRoom(supabase, roomId);
      if (!room) return;
      const { data: sp } = await supabase
        .from("sitter_profiles")
        .select("full_name")
        .eq("id", room.sitter_id)
        .maybeSingle();
      const name =
        sp && typeof sp === "object" && "full_name" in sp
          ? String((sp as { full_name?: string }).full_name ?? "").trim()
          : "";
      if (name) setTitle(name);
    })();
  }, [roomId]);

  return (
    <div className="flex items-center justify-between">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 rounded-full border border-navy-header/20 bg-white px-3 py-1.5 text-xs font-semibold text-navy-header shadow-sm transition hover:bg-brand-cream"
      >
        <ArrowRight className="h-4 w-4" />
        חזרה
      </Link>
      <h1 className="text-lg font-bold text-navy-header">{title}</h1>
    </div>
  );
}
