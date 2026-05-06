"use client";

import Image from "next/image";
import { useState } from "react";

const logoFrame =
  "relative mx-auto aspect-square w-[min(85vw,220px)] shrink-0 overflow-hidden rounded-full bg-brand-cream shadow-soft ring-2 ring-white sm:w-52 md:w-56";

/** `/logo_header.png` inside a perfect circle; mint circle if the asset fails to load. */
export function LandingLogoHeader() {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex aspect-square w-[min(85vw,220px)] items-center justify-center rounded-full bg-brand-mint shadow-soft ring-2 ring-navy-header/15 sm:w-52 md:w-56`}
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
        className="object-contain object-center p-2"
        sizes="(max-width: 640px) 220px, 224px"
        priority
        onError={() => setFailed(true)}
      />
    </div>
  );
}
