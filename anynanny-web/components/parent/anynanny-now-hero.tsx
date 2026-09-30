import type { CSSProperties } from "react";
import { AnyNannyLogo } from "@/components/brand/anynanny-logo";

const NOW_TYPE: CSSProperties = {
  fontFamily:
    '"Arial Black", "Arial Bold", Impact, "Franklin Gothic Heavy", "Helvetica Neue", sans-serif',
  fontStyle: "normal",
  fontWeight: 900,
  transform: "none",
  whiteSpace: "nowrap",
  lineHeight: 1,
  letterSpacing: "-0.04em",
  color: "#FFFFFF",
  WebkitTextStroke: "0.6px rgba(0,45,75,0.70)",
  paintOrder: "stroke fill",
  textShadow: "0 1px 1px rgba(0,40,55,0.35)"
};

/** Compact AnyNanny wordmark with the NOW badge as a logo extension. No interaction. */
export function AnyNannyNowHero() {
  return (
    <div
      dir="ltr"
      className="mx-auto mt-3 flex max-w-full items-center justify-center gap-2"
      aria-hidden
    >
      <AnyNannyLogo variant="compact" decorative />
      <div className="relative h-[3.25rem] w-[3.25rem] shrink-0">
        <span
          className="pointer-events-none absolute inset-[-18%] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(0,168,107,0.28) 0%, rgba(0,168,107,0.08) 46%, transparent 72%)"
          }}
        />
        <div
          className="absolute inset-0 overflow-hidden rounded-full"
          style={{
            background:
              "radial-gradient(circle at 35% 25%, #6DF3A9 0%, #1ED47A 40%, #00A86B 58%, #0EA05A 78%, #0A7A45 100%)",
            boxShadow: [
              "0 6px 10px -6px rgba(4, 80, 55, 0.55)",
              "0 0 8px rgba(0, 168, 107, 0.22)",
              "inset 0 4px 6px rgba(255, 255, 255, 0.28)",
              "inset 0 -8px 10px rgba(0, 40, 24, 0.35)"
            ].join(", ")
          }}
        >
          <span
            dir="ltr"
            className="absolute inset-0 z-[3] flex items-center justify-center text-center text-[13px] not-italic"
            style={NOW_TYPE}
          >
            NOW!
          </span>
        </div>
      </div>
    </div>
  );
}
