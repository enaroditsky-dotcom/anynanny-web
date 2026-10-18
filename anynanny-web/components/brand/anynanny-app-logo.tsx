export const ANYNANNY_APP_LOGO_SRC = encodeURI(
  "/brand/לוגו AnyNanny עם מטפלת מחייכת.png"
);

const WRAPPER_CLASS = {
  // Canvas is 2172×724. Width sets the height so the artwork is never cropped.
  // Sizes are 1.85× the previous header lockup.
  // `shell` is 14.3375rem × 4.778rem and fits the 5.2rem app bar.
  // `header` is 24.5125rem × 8.168rem (sm: 27.2875rem × 9.093rem).
  shell: "w-[14.3375rem] max-w-[calc(100vw-1.5rem)]",
  header: "w-[24.5125rem] max-w-full sm:w-[27.2875rem]"
} as const;

export type AnyNannyAppLogoVariant = keyof typeof WRAPPER_CLASS;

type AnyNannyAppLogoProps = {
  variant?: AnyNannyAppLogoVariant;
  className?: string;
  /** Set when another accessible AnyNanny name is already present. */
  decorative?: boolean;
};

/**
 * In-app full logo (smiling babysitter + wordmark).
 * One asset only — do not pair it with a separate portrait or wordmark.
 */
export function AnyNannyAppLogo({
  variant = "shell",
  className = "",
  decorative = false
}: AnyNannyAppLogoProps) {
  return (
    <span
      className={`inline-block min-w-0 shrink bg-transparent ${WRAPPER_CLASS[variant]} ${className}`.trim()}
      style={{ aspectRatio: "2172 / 724" }}
    >
      <img
        src={ANYNANNY_APP_LOGO_SRC}
        alt={decorative ? "" : "AnyNanny"}
        aria-hidden={decorative ? true : undefined}
        dir="ltr"
        draggable={false}
        decoding="async"
        className="block h-full w-full max-h-full max-w-full bg-transparent object-contain object-center select-none"
      />
    </span>
  );
}
