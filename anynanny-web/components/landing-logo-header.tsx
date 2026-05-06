"use client";

import Image from "next/image";
import { useState } from "react";

/** Uses `/logo_header.png`; shows a circular placeholder if the asset fails to load. */
export function LandingLogoHeader() {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className="mx-auto flex h-36 w-36 shrink-0 items-center justify-center rounded-full bg-brand-mint shadow-soft ring-2 ring-navy-900/10 sm:h-40 sm:w-40 md:h-44 md:w-44"
        aria-hidden
      >
        <span className="sr-only">AnyNanny</span>
      </div>
    );
  }

  return (
    <div className="relative mx-auto h-36 w-44 shrink-0 sm:h-40 sm:w-48 md:h-44 md:w-52">
      <Image
        src="/logo_header.png"
        alt="AnyNanny"
        fill
        className="object-contain object-center"
        sizes="(max-width: 768px) 192px, 208px"
        priority
        onError={() => setFailed(true)}
      />
    </div>
  );
}
