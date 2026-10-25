"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { NANNY_IMAGE_SRC } from "@/lib/broadcast/system-talks";

export function NannyTalksFrame({
  title,
  onDismiss,
  children
}: {
  title: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-3 py-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <button type="button" className="absolute inset-0 bg-[#001F3F]/45" aria-label="סגור את החלון" onClick={onDismiss} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nanny-talks-title"
        tabIndex={-1}
        className="relative z-10 flex w-full max-w-[min(100%,28rem)] items-end gap-1 outline-none sm:gap-2"
        dir="rtl"
        data-nanny-talks-modal
      >
        <img
          src={NANNY_IMAGE_SRC}
          alt=""
          aria-hidden
          data-nanny-character
          className="mb-1 h-20 w-auto max-w-[26%] shrink-0 object-contain object-bottom sm:h-28"
        />
        <div className="relative min-w-0 flex-1">
          <div
            data-nanny-speech-bubble
            className="max-h-[min(70dvh,34rem)] overflow-y-auto rounded-[1.6rem] border border-[#001F3F]/10 bg-[#FFF8EE] px-4 py-4 text-right text-[#001F3F] shadow-[0_16px_40px_-24px_rgba(0,31,63,0.55)]"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <h2 id="nanny-talks-title" className="text-sm font-bold">
                {title}
              </h2>
              <button
                type="button"
                aria-label="סגור"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#001F3F]/70"
                onClick={onDismiss}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {children}
          </div>
          <svg
            data-nanny-speech-tail
            viewBox="0 0 28 18"
            aria-hidden
            className="absolute -bottom-2 start-8 h-4 w-7 text-[#FFF8EE]"
          >
            <path d="M2 2 C10 2 12 16 26 14 C14 16 8 8 2 2 Z" fill="currentColor" />
          </svg>
        </div>
      </div>
    </div>
  );
}
