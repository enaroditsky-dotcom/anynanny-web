"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import { CHAT_COMPOSER_ACTIVE_EVENT } from "@/lib/chat/composer-chrome";
import {
  INCOMING_CHAT_TOAST_DURATION_MS,
  type IncomingChatToastState
} from "@/lib/chat/incoming-chat-toast";

const TOAST_SURFACE =
  "pointer-events-auto fixed z-[70] w-[min(92vw,22rem)] rounded-2xl border border-slate-200/90 bg-white p-3 text-right shadow-[0_10px_28px_-12px_rgba(15,23,42,0.35)]";

const TOAST_BOTTOM =
  "bottom-[calc(5.5rem+var(--anynanny-now-dock,0px)+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2";

const TOAST_TOP = "top-20 left-1/2 -translate-x-1/2";

export function GlobalChatToast({
  toast,
  href,
  onDismiss
}: {
  toast: IncomingChatToastState | null;
  href: string | null;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const [composerActive, setComposerActive] = useState(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const onComposer = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      setComposerActive(Boolean(detail?.active));
    };
    window.addEventListener(CHAT_COMPOSER_ACTIVE_EVENT, onComposer);
    return () => window.removeEventListener(CHAT_COMPOSER_ACTIVE_EVENT, onComposer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => onDismissRef.current(), INCOMING_CHAT_TOAST_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [toast?.messageId]);

  if (!toast) return null;

  const openConversation = () => {
    if (href) router.push(href);
    onDismiss();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      dir="rtl"
      className={`${TOAST_SURFACE} ${composerActive ? TOAST_TOP : TOAST_BOTTOM}`}
    >
      <div className="flex flex-row-reverse items-start gap-2">
        <button
          type="button"
          aria-label="סגור"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          onClick={(event) => {
            event.stopPropagation();
            onDismiss();
          }}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={openConversation}
          className="flex min-w-0 flex-1 flex-row-reverse items-start gap-2 text-right"
        >
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <MessageCircle className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-[#001F3F]">{toast.title}</span>
            {toast.body ? (
              <span className="mt-0.5 block text-xs leading-snug text-slate-600">{toast.body}</span>
            ) : null}
          </span>
        </button>
      </div>
    </div>
  );
}
