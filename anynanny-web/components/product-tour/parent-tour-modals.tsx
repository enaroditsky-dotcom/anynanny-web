"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import {
  PARENT_TOUR_COPY,
  PARENT_TOUR_INVITE_IMAGE_FALLBACK,
  PARENT_TOUR_INVITE_IMAGE_SRC
} from "@/lib/product-tour/constants";
import {
  AUTH_MODAL_CENTER_WRAP,
  AUTH_MODAL_OVERLAY_SCROLL
} from "@/lib/ui/auth-modal-overlay";
import {
  PARENT_TOUR_PRIMARY_WIDE_BUTTON_CLASS,
  PARENT_TOUR_SECONDARY_BUTTON_CLASS
} from "@/components/product-tour/product-tour-engine";

function TourModalShell({
  titleId,
  title,
  children
}: {
  titleId: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`fixed inset-0 z-[160] ${AUTH_MODAL_OVERLAY_SCROLL} bg-[#001F3F]/45 backdrop-blur-[2px]`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className={AUTH_MODAL_CENTER_WRAP}>
        <div
          className="my-auto w-full max-w-sm overflow-hidden rounded-2xl border border-[#001F3F]/10 bg-[#FDFBF6] text-right shadow-2xl"
          dir="rtl"
        >
          <div className="p-4">
            <h2 id={titleId} className="text-base font-bold text-[#001F3F]">
              {title}
            </h2>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ParentTourInviteModal({
  onAccept,
  onDecline
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  const titleId = useId();
  const [imageSrc, setImageSrc] = useState(PARENT_TOUR_INVITE_IMAGE_SRC);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <TourModalShell titleId={titleId} title={PARENT_TOUR_COPY.inviteTitle}>
      <div className="mt-4 overflow-hidden rounded-2xl border border-[#001F3F]/10 bg-white">
        <img
          src={imageSrc}
          alt=""
          className="h-auto w-full object-cover"
          onError={() => setImageSrc(PARENT_TOUR_INVITE_IMAGE_FALLBACK)}
        />
      </div>
      <p className="mt-4 text-sm leading-relaxed text-slate-600">{PARENT_TOUR_COPY.inviteBody}</p>
      <div className="mt-5 space-y-2">
        <button type="button" className={PARENT_TOUR_PRIMARY_WIDE_BUTTON_CLASS} onClick={onAccept} autoFocus>
          {PARENT_TOUR_COPY.invitePrimary}
        </button>
        <button type="button" className={PARENT_TOUR_SECONDARY_BUTTON_CLASS} onClick={onDecline}>
          {PARENT_TOUR_COPY.inviteSecondary}
        </button>
      </div>
    </TourModalShell>
  );
}

export function ParentTourDeclinedModal({ onConfirm }: { onConfirm: () => void }) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onConfirm]);

  return (
    <TourModalShell titleId={titleId} title={PARENT_TOUR_COPY.inviteTitle}>
      <p className="mt-4 text-sm leading-relaxed text-slate-600">{PARENT_TOUR_COPY.declinedBody}</p>
      <div className="mt-5">
        <button type="button" className={PARENT_TOUR_PRIMARY_WIDE_BUTTON_CLASS} onClick={onConfirm} autoFocus>
          {PARENT_TOUR_COPY.declinedConfirm}
        </button>
      </div>
    </TourModalShell>
  );
}

export function ParentTourCompletionModal({
  onSearch,
  onNow
}: {
  onSearch: () => void;
  onNow: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <TourModalShell titleId={titleId} title={PARENT_TOUR_COPY.completionTitle}>
      <p className="mt-4 text-sm leading-relaxed text-slate-600">{PARENT_TOUR_COPY.completionBody}</p>
      <div className="mt-5 space-y-2">
        <button type="button" className={PARENT_TOUR_PRIMARY_WIDE_BUTTON_CLASS} onClick={onSearch} autoFocus>
          {PARENT_TOUR_COPY.completionPrimary}
        </button>
        <button type="button" className={PARENT_TOUR_SECONDARY_BUTTON_CLASS} onClick={onNow}>
          {PARENT_TOUR_COPY.completionSecondary}
        </button>
      </div>
    </TourModalShell>
  );
}
