"use client";

import { useId, useRef, useState } from "react";

export const PARENT_PROFILE_CARD_HELP_TEXT = "כך אחרים רואים את הפרופיל שלך ב־AnyNanny";

const PARENT_HELP_BUTTON_CLASS =
  "relative inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#001F3F]/25 bg-white text-[12px] font-bold leading-none text-[#001F3F]/55 transition hover:border-[#001F3F]/45 hover:text-[#001F3F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#001F3F]/30";

/** Circular help control. The explanation is shown only while the icon is open or focused. */
export function ParentProfileCardHelp({ buttonClassName }: { buttonClassName?: string } = {}) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const fromPointer = useRef(false);

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        className={buttonClassName ?? PARENT_HELP_BUTTON_CLASS}
        aria-label="מידע נוסף"
        aria-expanded={open}
        aria-controls={tooltipId}
        aria-describedby={open ? tooltipId : undefined}
        onPointerDown={() => {
          fromPointer.current = true;
        }}
        onFocus={() => {
          if (fromPointer.current) return;
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setOpen(false);
          }
        }}
        onPointerUp={() => {
          fromPointer.current = false;
        }}
        onPointerCancel={() => {
          fromPointer.current = false;
        }}
      >
        <span className="absolute -inset-2.5" aria-hidden />?
      </button>
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute left-0 top-[calc(100%+1.15rem)] z-20 block w-max max-w-[min(16rem,calc(100vw-2.5rem))] rounded-xl bg-[#001F3F] px-3 py-2 text-right text-xs font-medium leading-relaxed text-white shadow-lg"
        >
          {PARENT_PROFILE_CARD_HELP_TEXT}
        </span>
      ) : null}
    </span>
  );
}
