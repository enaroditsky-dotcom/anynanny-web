"use client";

import { memo } from "react";
import { createPortal } from "react-dom";
import { Star, X } from "lucide-react";
import type { RejectedSitterSnapshot } from "@/lib/sitter/fetch-rejected-sitter-snapshot";

export type { RejectedSitterSnapshot };

export type DeclineNoticeState = {
  message: string;
  secondary: string;
  sitter: RejectedSitterSnapshot;
};

/** @deprecated Use RejectedSitterSnapshot */
export type BroadcastDeclineSitterSnapshot = RejectedSitterSnapshot;
/** @deprecated Use DeclineNoticeState */
export type BroadcastDeclineNoticeState = DeclineNoticeState;

function DeclineSitterAvatar({
  name,
  avatarUrl
}: {
  name: string;
  avatarUrl: string | null;
}) {
  const initial = name.trim().charAt(0) || "נ";

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-purple-100 bg-purple-50 text-sm font-black text-purple-700">
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}

/**
 * Isolated decline UI. Renders ONLY from the stored snapshot on `notice`.
 * Must never look up available sitters, responders, or the active booking list.
 */
export const DeclineNoticeUnit = memo(function DeclineNoticeUnit({
  notice,
  onClose
}: {
  notice: DeclineNoticeState;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;

  const sitter = notice.sitter;

  return createPortal(
    <div
      role="status"
      aria-live="assertive"
      dir="rtl"
      className="fixed inset-x-0 z-[100] flex justify-center px-2.5"
      style={{
        bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px) + 0.75rem)"
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl shadow-[0_10px_28px_-12px_rgba(0,31,63,0.45)]">
        <div className="flex items-start gap-2 bg-[#001F3F] px-3 py-2.5 text-right">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-snug text-white">
              {notice.message}
            </p>
            {notice.secondary.trim() ? (
              <p className="mt-1 text-xs font-medium leading-snug text-white/90">
                {notice.secondary}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="סגור"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/80 transition hover:bg-white/10 hover:text-white"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        <div className="flex items-center gap-2.5 border-t border-[#001F3F]/10 bg-white px-3 py-2.5">
          <DeclineSitterAvatar name={sitter.name} avatarUrl={sitter.avatarUrl} />
          <div className="min-w-0 flex-1 text-right">
            <p className="truncate text-sm font-bold leading-tight text-[#001F3F]">
              {sitter.name}
            </p>
            {sitter.rating != null ? (
              <span className="mt-0.5 inline-flex items-center gap-0.5 text-[12px] font-bold text-amber-700">
                <Star className="h-2.5 w-2.5 fill-current text-amber-500" />
                {sitter.rating.toFixed(1)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
});

export const BroadcastDeclineNoticeUnit = DeclineNoticeUnit;
