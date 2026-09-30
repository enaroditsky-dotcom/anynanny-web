"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  parentIdentityVerificationHref,
  UNVERIFIED_PARENT_NOW_NOTICE_BODY,
  UNVERIFIED_PARENT_NOW_NOTICE_FOLLOWUP,
  UNVERIFIED_PARENT_NOW_NOTICE_HEADING,
  VERIFIED_IDENTITY_PHRASE
} from "@/lib/trust/request-recipient-filters";

const HIGHLIGHT = `${VERIFIED_IDENTITY_PHRASE}.`;
const highlightAt = UNVERIFIED_PARENT_NOW_NOTICE_BODY.lastIndexOf(HIGHLIGHT);
const bodyBeforePhrase =
  highlightAt >= 0
    ? UNVERIFIED_PARENT_NOW_NOTICE_BODY.slice(0, highlightAt)
    : UNVERIFIED_PARENT_NOW_NOTICE_BODY;

export type UnverifiedParentNowNoticeProps = {
  onDismiss: () => void;
};

export function UnverifiedParentNowNotice({ onDismiss }: UnverifiedParentNowNoticeProps) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <section
      className={`overflow-x-hidden rounded-3xl border border-[#001F3F]/10 bg-white px-3.5 py-3.5 shadow-[0_28px_64px_-8px_rgba(0,31,63,0.48),0_14px_28px_-12px_rgba(0,31,63,0.32)] ring-1 ring-white transition duration-300 ease-out ${
        entered ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.98] opacity-0"
      }`}
      dir="rtl"
      role="note"
      aria-labelledby="unverified-parent-now-notice-title"
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FF8A8A] text-sm font-black leading-none text-white shadow-sm"
          aria-hidden
        >
          !
        </span>
        <h2
          id="unverified-parent-now-notice-title"
          className="text-base font-black leading-none text-[#001F3F]"
        >
          {UNVERIFIED_PARENT_NOW_NOTICE_HEADING}
        </h2>
      </div>
      <p className="mt-2 break-words text-right text-[13px] font-medium leading-relaxed text-[#001F3F]">
        {bodyBeforePhrase}
        <span className="font-bold text-[#00A86B]">{VERIFIED_IDENTITY_PHRASE}</span>.
      </p>
      <p className="mt-1.5 break-words text-right text-[13px] leading-relaxed text-[#001F3F]">
        {UNVERIFIED_PARENT_NOW_NOTICE_FOLLOWUP}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          href={parentIdentityVerificationHref()}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#001F3F] px-2 py-2 text-center text-[13px] font-bold leading-tight text-white transition hover:bg-[#002b5c]"
        >
          לאימות זהות
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#001F3F]/20 bg-white px-2 py-2 text-center text-[13px] font-bold leading-tight text-[#001F3F] transition hover:bg-[#FDFBF6]"
        >
          להתעלם ולהמשיך
        </button>
      </div>
    </section>
  );
}
