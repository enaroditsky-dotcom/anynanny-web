"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import {
  parentIdentityVerificationHref,
  VERIFIED_IDENTITY_PHRASE,
  VERIFIED_PARENT_BOOKING_BLOCK_HELP
} from "@/lib/trust/request-recipient-filters";
import {
  AUTH_MODAL_CENTER_WRAP,
  AUTH_MODAL_OVERLAY_SCROLL
} from "@/lib/ui/auth-modal-overlay";

export type VerifiedParentBookingBlockModalProps = {
  open: boolean;
  sitterName: string;
  onClose: () => void;
};

export function VerifiedParentBookingBlockModal({
  open,
  sitterName,
  onClose
}: VerifiedParentBookingBlockModalProps) {
  const helpId = useId();
  const titleId = useId();
  const [helpOpen, setHelpOpen] = useState(false);
  const name = sitterName.trim() || "הבייביסיטר";

  useEffect(() => {
    if (!open) setHelpOpen(false);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[140] ${AUTH_MODAL_OVERLAY_SCROLL} bg-black/50 backdrop-blur-[2px]`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      dir="rtl"
      onClick={onClose}
    >
      <div className={AUTH_MODAL_CENTER_WRAP}>
        <div
          className="my-auto w-full max-w-md overflow-x-hidden rounded-3xl border border-navy-header/12 bg-white p-5 shadow-2xl shadow-[#001F3F]/15"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="min-w-0 text-right">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#00A86B]/10">
              <ShieldCheck className="h-5 w-5 text-[#00A86B]" aria-hidden />
            </div>
            <h2 id={titleId} className="text-lg font-bold leading-snug text-[#001F3F]">
              אין באפשרותך לתאם משמרת עם {name}.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#001F3F]">
              {name} בחרה לקבל בקשות רק מהורים עם{" "}
              <span className="font-bold text-[#00A86B]">{VERIFIED_IDENTITY_PHRASE}</span>.
              <button
                type="button"
                aria-label="הסבר על זהות מאומתת"
                aria-expanded={helpOpen}
                aria-controls={helpId}
                onClick={() => setHelpOpen((current) => !current)}
                className="relative ms-1.5 inline-flex h-5 w-5 shrink-0 translate-y-0.5 items-center justify-center rounded-full border border-[#00A86B]/35 bg-white align-middle text-[11px] font-semibold leading-none text-[#00A86B]"
              >
                <span className="absolute -inset-2" aria-hidden />?
              </button>
            </p>
            {helpOpen ? (
              <p
                id={helpId}
                role="note"
                className="mt-3 break-words rounded-2xl bg-[#FDFBF6] px-3 py-2.5 text-right text-[13px] font-normal leading-relaxed text-slate-600"
              >
                {VERIFIED_PARENT_BOOKING_BLOCK_HELP}
              </p>
            ) : null}
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <Link
              href={parentIdentityVerificationHref()}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[#001F3F] px-4 py-3 text-sm font-bold text-white shadow-soft transition hover:bg-[#002b5c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#001F3F]"
            >
              לאימות זהות
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              סגור
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
