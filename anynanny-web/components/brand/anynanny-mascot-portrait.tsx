type AnynannyMascotPortraitProps = {
  /** Fixed outer size for the circular frame (unchanged footprint). */
  className?: string;
  alt?: string;
  decorative?: boolean;
  borderClassName?: string;
  shadowClassName?: string;
};

/**
 * Circular Anny portrait with a subtle breakout: the circle stays the same size
 * while the illustration scales slightly and shifts up so the head/arms peek past the rim.
 */
export function AnynannyMascotPortrait({
  className = "",
  alt = "AnyNanny",
  decorative = false,
  borderClassName = "border-2 border-navy-header/20",
  shadowClassName = "shadow-md"
}: AnynannyMascotPortraitProps) {
  return (
    <div className={`relative shrink-0 overflow-visible ${className}`.trim()}>
      <div
        aria-hidden
        className={`absolute inset-0 z-0 rounded-full bg-white ${borderClassName} ${shadowClassName}`.trim()}
      />
      <img
        src="/anynanny-clean-transparent.png.jpg"
        alt={decorative ? "" : alt}
        aria-hidden={decorative ? true : undefined}
        draggable={false}
        className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-[115%] w-[115%] max-w-none -translate-x-1/2 -translate-y-[55%] object-contain select-none"
        onError={(e) => {
          (e.target as HTMLImageElement).src = "/anynanny_clean.jpg";
        }}
      />
    </div>
  );
}
