"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  CANCELLATION_COPY,
  formatCancellationShiftWhen,
  isIncomingCancellationRequest,
  isOutgoingCancellationRequest,
  isScheduledShiftCancellable,
  requesterDisplayLabel,
  type CancellationRequesterRole,
  type CancellationShiftLike
} from "@/lib/bookings/cancellation-request";

const ACTION_LINK_CLASS =
  "text-xs font-semibold text-navy-header underline underline-offset-2 hover:text-navy-header/80";
const ACTION_BUTTON_CLASS =
  "text-xs font-semibold text-navy-header underline underline-offset-2 hover:text-navy-header/80 disabled:opacity-50";
const CANCEL_BUTTON_CLASS =
  "text-xs font-semibold text-rose-700 underline underline-offset-2 hover:text-rose-800 disabled:opacity-50";

export type ScheduledShiftActionsProps = {
  shift: CancellationShiftLike;
  viewerRole: CancellationRequesterRole;
  viewerUserId: string;
  profileLabel: string;
  profileHref?: string | null;
  renderProfile?: ReactNode;
  contactHref?: string | null;
  onRequestCancellation: () => void;
  onApproveCancellation: () => void;
};

export function ScheduledShiftActions({
  shift,
  viewerRole,
  viewerUserId,
  profileLabel,
  profileHref,
  renderProfile,
  contactHref,
  onRequestCancellation,
  onApproveCancellation
}: ScheduledShiftActionsProps) {
  if (!isScheduledShiftCancellable(shift) && !isIncomingCancellationRequest(shift, viewerUserId)) {
    return null;
  }

  const incoming = isIncomingCancellationRequest(shift, viewerUserId);
  const outgoing = isOutgoingCancellationRequest(shift, viewerUserId);
  const profileNode = renderProfile ?? (
    profileHref ? (
      <Link href={profileHref} className={ACTION_LINK_CLASS}>
        {profileLabel}
      </Link>
    ) : null
  );
  const contactNode = contactHref ? (
    <Link href={contactHref} className={ACTION_LINK_CLASS}>
      {CANCELLATION_COPY.contact}
    </Link>
  ) : null;

  if (incoming) {
    const requesterName = requesterDisplayLabel(shift, viewerRole);
    const whenLabel = formatCancellationShiftWhen(shift);
    const roleHint =
      shift.cancellationRequestedRole === "parent"
        ? "ההורה"
        : shift.cancellationRequestedRole === "sitter"
          ? "הנני"
          : requesterName;

    return (
      <div className="mt-3 space-y-2 border-t border-amber-100 pt-3 text-right">
        <p className="text-sm font-bold text-amber-900">{CANCELLATION_COPY.receivedHeading}</p>
        <p className="text-xs text-slate-600">
          {roleHint === requesterName ? `${requesterName} ביקש/ה לבטל את המשמרת.` : `${roleHint} ביקש/ה לבטל את המשמרת.`}
        </p>
        <p className="text-xs font-medium tabular-nums text-slate-500">{whenLabel}</p>
        {shift.cancellationMessage ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
            {shift.cancellationMessage}
          </p>
        ) : null}
        <div className="flex flex-row-reverse flex-wrap items-center justify-end gap-x-4 gap-y-2">
          {contactNode}
          <button type="button" onClick={onApproveCancellation} className={CANCEL_BUTTON_CLASS}>
            {CANCELLATION_COPY.approve}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-row-reverse flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
      {profileNode}
      {contactNode}
      {outgoing ? (
        <span className="text-xs font-semibold text-amber-800">{CANCELLATION_COPY.requestPending}</span>
      ) : (
        <button type="button" onClick={onRequestCancellation} className={ACTION_BUTTON_CLASS}>
          {CANCELLATION_COPY.requestButton}
        </button>
      )}
    </div>
  );
}
