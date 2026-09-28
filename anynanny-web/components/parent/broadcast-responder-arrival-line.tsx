import React from "react";
import { parentNowArrivalLine } from "@/lib/broadcast/now-request-details";

/** Compact ETA on an AnyNanny NOW responder card. Renders nothing when there is no stored ASAP range. */
export function BroadcastResponderArrivalLine({
  timingMode,
  arrivalRange
}: {
  timingMode?: unknown;
  arrivalRange?: unknown;
}) {
  const line = parentNowArrivalLine({ timingMode, arrivalRange });
  if (!line) return null;

  return (
    <p className="break-words text-[13px] font-semibold leading-snug text-[#001F3F]">
      🕒 {line}
    </p>
  );
}
