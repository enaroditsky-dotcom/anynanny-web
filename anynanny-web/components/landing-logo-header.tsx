"use client";

import Image from "next/image";
import { useState } from "react";

const logoFrame =
  "relative mx-auto aspect-square w-[min(82vw,240px)] shrink-0 overflow-hidden rounded-full bg-[#fdfbf8] shadow-soft ring-1 ring-navy-header/[0.08] sm:w-56 md:w-[248px]";

/** `/logo_header.png` centered in a circular frame; neutral cream fallback if load fails. */
export function LandingLogoHeader() {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className="flex aspect-square w-[min(82vw,240px)] items-center justify-center rounded-full bg-[#f5f0eb] shadow-soft ring-1 ring-navy-header/[0.12] sm:w-56 md:w-[248px]"
        aria-hidden
      >
        <span className="sr-only">AnyNanny</span>
      </div>
    );
  }

  return (
    <div className={logoFrame}>
      <Image
        src="/logo_header.png"
        alt="AnyNanny"
        fill
        className="object-contain object-center p-[10px] sm:p-3"
        sizes="(max-width: 640px) 240px, 248px"
        priority
        onError={() => setFailed(true)}
      />
    </div>
  );
}
