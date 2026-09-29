"use client";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";

type DeleteConversationDialogProps = {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteConversationDialog({
  open,
  busy = false,
  error = null,
  onClose,
  onConfirm
}: DeleteConversationDialogProps) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => {
      previous?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const first = cancelRef.current;
    const last = confirmRef.current;
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[140] overflow-y-auto overscroll-contain bg-[#001F3F]/40 px-4 pt-4 pb-[calc(8rem+var(--anynanny-now-dock,0px)+env(safe-area-inset-bottom,0px))] scroll-pb-[calc(8rem+var(--anynanny-now-dock,0px)+env(safe-area-inset-bottom,0px))] backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={() => {
        if (!busy) onClose();
      }}
      onKeyDown={trapFocus}
    >
      <div className="flex min-h-full justify-center">
        <div
          className="my-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-[#FDFBF6] p-4 text-right shadow-2xl"
          dir="rtl"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id={titleId} className="text-lg font-bold text-navy-header">
            בטוח למחוק את הצ'ט הזה?
          </h2>
          {error ? (
            <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              ref={cancelRef}
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              לא
            </button>
            <button
              ref={confirmRef}
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
            >
              {busy ? "מוחק…" : "כן, למחוק"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
