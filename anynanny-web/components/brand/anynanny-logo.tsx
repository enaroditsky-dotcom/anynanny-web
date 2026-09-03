export const ANYNANNY_WORDMARK_SRC = "/brand/anynanny-wordmark.png";

const WRAPPER_CLASS = {
  header: "h-11 max-w-full sm:h-12",
  hero: "h-14 max-w-full sm:h-[4.5rem]"
} as const;

export type AnyNannyLogoVariant = keyof typeof WRAPPER_CLASS;

type AnyNannyLogoProps = {
  variant?: AnyNannyLogoVariant;
  className?: string;
  /** Set when another accessible AnyNanny name is already present. */
  decorative?: boolean;
};

/**
 * Canonical AnyNanny header/hero wordmark. Uses the official transparent
 * PNG — do not redraw in CSS/SVG.
 */
export function AnyNannyLogo({
  variant = "header",
  className = "",
  decorative = false
}: AnyNannyLogoProps) {
  return (
    <span
      className={`inline-block min-w-0 shrink bg-transparent ${WRAPPER_CLASS[variant]} ${className}`.trim()}
      style={{ aspectRatio: "1600 / 494", width: "auto" }}
    >
      <img
        src={ANYNANNY_WORDMARK_SRC}
        alt={decorative ? "" : "AnyNanny"}
        aria-hidden={decorative ? true : undefined}
        dir="ltr"
        draggable={false}
        className="block h-full w-full max-h-full max-w-full bg-transparent object-contain object-center select-none"
      />
    </span>
  );
}
