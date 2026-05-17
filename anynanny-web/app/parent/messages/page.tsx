"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ArrowRight, MessageCircle } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { CHAT_ROOMS_TABLE } from "@/lib/chat/constants";
import { getOrCreateChatRoom } from "@/lib/chat/parent-chat";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type InboxRow = {
  id: string;
  sitter_id: string;
  updated_at: string;
  sitter_name: string | null;
};

function ParentMessagesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sitterIdFromQuery = searchParams.get("sitter_id")?.trim() ?? "";
  const { isLoading, signedIn, effectiveRole } = useAuth();
  const [inbox, setInbox] = useState<InboxRow[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);

  const openChatWithSitter = useCallback(
    async (sitterId: string) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setDeepLinkError("Supabase לא זמין");
        return;
      }
      const { roomId, error } = await getOrCreateChatRoom(supabase, sitterId);
      if (error || !roomId) {
        setDeepLinkError(error ?? "לא ניתן לפתוח שיחה");
        return;
      }
      router.replace(`/parent/chat/${encodeURIComponent(roomId)}`);
    },
    [router]
  );

  const loadInbox = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadingInbox(false);
      return;
    }

    const { data: rooms, error } = await supabase
      .from(CHAT_ROOMS_TABLE)
      .select("id, sitter_id, updated_at")
      .order("updated_at", { ascending: false });

    if (error || !rooms?.length) {
      setInbox([]);
      setLoadingInbox(false);
      return;
    }

    const sitterIds = [...new Set(rooms.map((r) => String(r.sitter_id)))];
    const { data: profiles } = await supabase
      .from("sitter_profiles")
      .select("id, full_name")
      .in("id", sitterIds);

    const nameById = new Map<string, string>();
    for (const p of profiles ?? []) {
      if (p && typeof p === "object" && "id" in p) {
        const id = String((p as { id: string }).id);
        const name = String((p as { full_name?: string }).full_name ?? "").trim();
        if (name) nameById.set(id, name);
      }
    }

    setInbox(
      rooms.map((r) => ({
        id: String(r.id),
        sitter_id: String(r.sitter_id),
        updated_at: String(r.updated_at),
        sitter_name: nameById.get(String(r.sitter_id)) ?? null
      }))
    );
    setLoadingInbox(false);
  }, []);

  useEffect(() => {
    if (isLoading || !signedIn || effectiveRole !== "parent") return;
    if (sitterIdFromQuery) {
      void openChatWithSitter(sitterIdFromQuery);
      return;
    }
    void loadInbox();
  }, [isLoading, signedIn, effectiveRole, sitterIdFromQuery, openChatWithSitter, loadInbox]);

  return (
    <>
      <div className="flex items-center justify-between">
        <Link
          href="/parent/dashboard"
          className="inline-flex items-center gap-1 rounded-full border border-navy-header/20 bg-white px-3 py-1.5 text-xs font-semibold text-navy-header shadow-sm transition hover:bg-brand-cream"
        >
          <ArrowRight className="h-4 w-4" />
          חזרה לדשבורד
        </Link>
        <h1 className="text-lg font-bold text-navy-header">הודעות</h1>
      </div>

      {deepLinkError ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-right text-xs text-rose-900">
          {deepLinkError}
        </p>
      ) : null}

      {sitterIdFromQuery && !deepLinkError ? (
        <section className="rounded-2xl border border-navy-header/10 bg-white p-6 text-center shadow-sm">
          <MessageCircle className="mx-auto h-8 w-8 text-navy-header" strokeWidth={1.75} />
          <p className="mt-3 text-sm text-navy-700">פותחים שיחה…</p>
        </section>
      ) : loadingInbox ? (
        <p className="text-right text-sm text-slate-600">טוען שיחות…</p>
      ) : inbox.length === 0 ? (
        <section className="rounded-2xl border border-navy-header/10 bg-white p-6 text-center shadow-sm">
          <MessageCircle className="mx-auto h-8 w-8 text-navy-header" strokeWidth={1.75} />
          <p className="mt-3 text-base font-semibold text-navy-900">אין שיחות עדיין</p>
          <p className="mt-1 text-sm text-navy-700">פתחו שיחה מפרופיל בייביסיטר בעמוד החיפוש.</p>
          <Link
            href="/parent/search"
            className="mt-4 inline-block text-sm font-semibold text-emerald-800 underline"
          >
            לחיפוש בייביסיטרים
          </Link>
        </section>
      ) : (
        <ul className="space-y-2">
          {inbox.map((row) => (
            <li key={row.id}>
              <Link
                href={`/parent/chat/${encodeURIComponent(row.id)}`}
                className="flex flex-row-reverse items-center justify-between gap-3 rounded-2xl border border-navy-header/10 bg-white px-4 py-3 shadow-sm transition hover:bg-brand-cream/40"
              >
                <span className="text-xs text-slate-500 tabular-nums">
                  {new Date(row.updated_at).toLocaleDateString("he-IL", { dateStyle: "short" })}
                </span>
                <span className="min-w-0 flex-1 truncate text-right text-sm font-semibold text-[#001F3F]">
                  {row.sitter_name ?? "בייביסיטר"}
                </span>
                <MessageCircle className="h-5 w-5 shrink-0 text-[#001F3F]" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function ParentMessagesPage() {
  return (
    <main className="mx-auto w-full max-w-md space-y-4 bg-[#FDFBF6] py-2" dir="rtl">
      <Suspense
        fallback={
          <p className="text-right text-sm text-slate-600" dir="rtl">
            טוען הודעות…
          </p>
        }
      >
        <ParentMessagesInner />
      </Suspense>
    </main>
  );
}
