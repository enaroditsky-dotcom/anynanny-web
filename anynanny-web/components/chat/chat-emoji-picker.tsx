"use client";

import { useEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";
import { CHAT_EMOJI_CATALOG } from "@/lib/chat/chat-emoji-catalog";

type ChatComposerEmojiControlProps = {
  disabled?: boolean;
  onInsert: (emoji: string) => void;
  onOpenChange?: (open: boolean) => void;
};

export function ChatComposerEmojiControl({
  disabled = false,
  onInsert,
  onOpenChange
}: ChatComposerEmojiControlProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const setPickerOpen = (next: boolean) => {
    setOpen(next);
    onOpenChangeRef.current?.(next);
  };

  useEffect(() => {
    if (!open) return;

    const close = () => {
      setOpen(false);
      onOpenChangeRef.current?.(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="shrink-0">
      <button
        type="button"
        data-chat-emoji-toggle
        disabled={disabled}
        aria-label="הוספת אימוג'י"
        title="אימוג'י"
        aria-expanded={open}
        aria-haspopup="dialog"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setPickerOpen(!open)}
        className={`flex h-11 w-11 items-center justify-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 ${
          open
            ? "border-blue-200 bg-blue-50 text-blue-600"
            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-blue-600"
        }`}
      >
        <Smile className="h-5 w-5" aria-hidden />
      </button>
      {open ? (
        <div
          role="dialog"
          data-chat-emoji-picker
          aria-label="בחירת אימוג'י"
          onMouseDown={(event) => event.preventDefault()}
          className="absolute bottom-full left-2 right-2 z-30 mb-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg"
        >
          <div
            dir="ltr"
            className="grid max-h-[min(12rem,36svh)] grid-cols-8 gap-0.5 overflow-y-auto overscroll-contain"
          >
            {CHAT_EMOJI_CATALOG.map((emoji, index) => (
              <button
                key={`${emoji}-${index}`}
                type="button"
                data-chat-emoji-option
                className="flex h-9 w-full items-center justify-center rounded-lg text-xl leading-none transition hover:bg-slate-100 active:scale-[0.96]"
                onClick={() => onInsert(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
