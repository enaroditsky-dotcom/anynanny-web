export const ANYNANNY_WORDMARK_SRC = "/brand/anynanny-official-wordmark.png";

const WRAPPER_CLASS = {
  // Width-based sizing so height is derived from the fixed logo aspect ratio.
  // This preserves the artwork proportions while making the wordmark visibly larger.
  header: "w-[15.97rem] max-w-full sm:w-[17.58rem]",
  hero: "w-[21.55rem] max-w-full sm:w-[26.94rem]"
} as const;

export type AnyNannyLogoVariant = keyof typeof WRAPPER_CLASS;

type AnyNannyLogoProps = {
  variant?: AnyNannyLogoVariant;
  className?: string;
  /** Set when another accessible AnyNanny name is already present. */
  decorative?: boolean;
};

/**
 * Canonical AnyNanny wordmark. Uses the official transparent PNG —
 * do not redraw in CSS/SVG or recolor the artwork.
 */
export function AnyNannyLogo({
  variant = "header",
  className = "",
  decorative = false
}: AnyNannyLogoProps) {
  return (
    <span
      className={`inline-block min-w-0 shrink bg-transparent ${WRAPPER_CLASS[variant]} ${className}`.trim()}
      style={{ aspectRatio: "1600 / 674" }}
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
