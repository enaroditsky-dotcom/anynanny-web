"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ParentBookingChatInbox } from "@/components/chat/booking-chat-inbox";
import { findChatBookingForParentSitter } from "@/lib/chat/booking-messages";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";

function ParentMessagesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sitterIdFromQuery = searchParams.get("sitter_id")?.trim() ?? "";
  const { isLoading, signedIn, effectiveRole } = useAuth();
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);

  const openChatWithSitter = useCallback(
    async (sitterId: string) => {
      const auth = await resolveBrowserAuth();
      if (!auth.ok) {
        setDeepLinkError("יש להתחבר מחדש");
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setDeepLinkError("Supabase לא זמין");
        return;
      }

      const { bookingId, error } = await findChatBookingForParentSitter(supabase, auth.userId, sitterId);
      if (error || !bookingId) {
        setDeepLinkError(error ?? "לא ניתן לפתוח שיחה");
        return;
      }

      router.replace(`/parent/chat/${encodeURIComponent(bookingId)}`);
    },
    [router]
  );

  useEffect(() => {
    if (isLoading || !signedIn || effectiveRole !== "parent") return;
    if (sitterIdFromQuery) {
      void openChatWithSitter(sitterIdFromQuery);
    }
  }, [isLoading, signedIn, effectiveRole, sitterIdFromQuery, openChatWithSitter]);

  if (sitterIdFromQuery && !deepLinkError) {
    return (
      <section className="rounded-2xl border border-navy-header/10 bg-white p-6 text-center shadow-sm">
        <MessageCircle className="mx-auto h-8 w-8 text-navy-header" strokeWidth={1.75} />
        <p className="mt-3 text-sm text-navy-700">פותחים שיחה…</p>
      </section>
    );
  }

  return (
    <>
      {deepLinkError ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-right text-xs text-rose-900">
          {deepLinkError}
        </p>
      ) : null}
      {!sitterIdFromQuery ? <ParentBookingChatInbox /> : null}
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
