"use client";

import { useId } from "react";
import Link from "next/link";
import {
  CANCELLATION_COPY,
  cancellationRoleLabel,
  incomingCancellationSentence,
  type CancellationRequesterRole
} from "@/lib/bookings/cancellation-request";
import type { CancellationAttentionItem } from "@/lib/bookings/cancellation-attention";

type ShiftCancellationIncomingModalProps = {
  open: boolean;
  item: CancellationAttentionItem | null;
  contactHref: string;
  busy?: boolean;
  error?: string | null;
  viewerRole: CancellationRequesterRole;
  onLater: () => void;
  onApprove: () => void;
};

export function ShiftCancellationIncomingModal({
  open,
  item,
  contactHref,
  busy = false,
  error = null,
  viewerRole,
  onLater,
  onApprove
}: ShiftCancellationIncomingModalProps) {
  const titleId = useId();
  if (!open || !item) return null;

  const roleLabel = cancellationRoleLabel(item.cancellationRequestedRole);
  const requesterName =
    item.requesterName.trim() ||
    (viewerRole === "sitter" ? CANCELLATION_COPY.roleParent : CANCELLATION_COPY.roleSitter);
  const sentence = incomingCancellationSentence(item, requesterName);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-[#001F3F]/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-rose-100 bg-[#FDFBF6] text-right shadow-2xl"
        dir="rtl"
      >
        <div className="border-b border-rose-100 bg-rose-50/70 px-5 py-4">
          <p className="text-[11px] font-semibold tracking-wide text-rose-800">{roleLabel}</p>
          <h2 id={titleId} className="mt-1 text-lg font-bold text-navy-header">
            {CANCELLATION_COPY.incomingTitle}
          </h2>
        </div>

        <div className="space-y-3 px-5 py-4">
          <p className="text-sm font-semibold text-navy-header">{requesterName}</p>
          <p className="text-sm leading-relaxed text-slate-700">{sentence}</p>
          {item.cancellationMessage ? (
            <div className="rounded-2xl border border-rose-100 bg-white px-3 py-2.5">
              <p className="text-xs font-semibold text-rose-800">{CANCELLATION_COPY.messageHistoryLabel}:</p>
              <p className="mt-1 text-sm leading-relaxed text-navy-header">{item.cancellationMessage}</p>
            </div>
          ) : null}
          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="space-y-2 px-5 pb-5">
          <button
            type="button"
            disabled={busy}
            onClick={onApprove}
            className="w-full rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
          >
            {busy ? CANCELLATION_COPY.approving : CANCELLATION_COPY.approve}
          </button>
          <Link
            href={contactHref}
            className="flex w-full items-center justify-center rounded-xl border border-navy-header/15 bg-white px-3 py-2.5 text-sm font-semibold text-navy-header transition hover:bg-slate-50"
          >
            {CANCELLATION_COPY.contact}
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={onLater}
            className="w-full rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {CANCELLATION_COPY.later}
          </button>
        </div>
      </div>
    </div>
  );
}
