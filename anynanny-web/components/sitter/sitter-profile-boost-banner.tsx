"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SITTER_HELP_ICON_CLASS } from "@/components/sitter/sitter-help-icon";
import { SITTER_PROFILE_BOOST_HREF } from "@/lib/sitter/profile-boost-progress";

const BOOST_HELP_TEXT = "טיפים שיעזרו לך לקבל יותר פניות";

function BoostHelp() {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        className={SITTER_HELP_ICON_CLASS}
        aria-label="מידע נוסף"
        aria-expanded={open}
        aria-controls={tooltipId}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <span className="absolute -inset-2" aria-hidden />?
      </button>
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          dir="rtl"
          className="pointer-events-none absolute left-0 top-[calc(100%+0.45rem)] z-20 block w-max max-w-[min(16rem,calc(100vw-4.5rem))] rounded-xl bg-[#001F3F] px-3 py-2 text-right text-xs font-medium leading-relaxed text-white shadow-lg"
        >
          {BOOST_HELP_TEXT}
        </span>
      ) : null}
    </span>
  );
}

/** Opens the profile-boost recommendations. The help control stays a separate button. */
export function SitterProfileBoostBanner() {
  return (
    <section
      aria-label="תני בוסט לפרופיל"
      className="relative flex h-12 w-full min-w-0 items-center rounded-2xl border border-[#7DCAA0] bg-white shadow-[0_8px_18px_-14px_rgba(14,159,110,0.7)]"
      dir="rtl"
    >
      <Link
        href={SITTER_PROFILE_BOOST_HREF}
        className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-2xl px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E9F6E]"
      >
        <img
          src="/images/sitter-boost-rocket.png"
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 object-contain"
        />
        <span className="min-w-0 flex-1 truncate text-right text-sm font-extrabold leading-none text-[#001F3F]">
          תני בוסט לפרופיל
        </span>
        <span className="w-4 shrink-0" aria-hidden />
        <ChevronLeft className="h-4 w-4 shrink-0 text-[#0E9F6E]" aria-hidden />
      </Link>
      <span className="absolute top-1/2 z-[1] -translate-y-1/2 left-[2.15rem]">
        <BoostHelp />
      </span>
    </section>
  );
}
