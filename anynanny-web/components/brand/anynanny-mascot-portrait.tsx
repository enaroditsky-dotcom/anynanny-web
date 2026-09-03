type AnynannyMascotPortraitProps = {
  className?: string;
  alt?: string;
  decorative?: boolean;
  /** When false, render only the artwork (no circular frame). */
  framed?: boolean;
  borderClassName?: string;
  shadowClassName?: string;
};

const MASCOT_SRC = "/anynanny-clean-transparent.png.jpg";
const MASCOT_FALLBACK = "/anynanny_clean.jpg";

const FRAMED_IMG_CLASS =
  "pointer-events-none absolute left-1/2 top-[60%] h-[158%] w-[158%] max-w-none -translate-x-1/2 -translate-y-1/2 object-contain object-center select-none";

/**
 * Anny mascot. Default is the circular framed portrait used on sign-up.
 * Pass `framed={false}` for a plain transparent cutout (homepage hero).
 *
 * The source file is a JPEG with a white matte — mix-blend-multiply
 * dissolves that matte against light page backgrounds.
 */
export function AnynannyMascotPortrait({
  className = "",
  alt = "AnyNanny",
  decorative = false,
  framed = true,
  borderClassName = "ring-navy-header/20",
  shadowClassName = "shadow-md"
}: AnynannyMascotPortraitProps) {
  const onImgError = (e: { currentTarget: HTMLImageElement }) => {
    e.currentTarget.src = MASCOT_FALLBACK;
  };

  if (!framed) {
    return (
      <img
        src={MASCOT_SRC}
        alt={decorative ? "" : alt}
        aria-hidden={decorative ? true : undefined}
        draggable={false}
        className={`pointer-events-none shrink-0 bg-transparent object-contain object-center mix-blend-multiply select-none ${className}`.trim()}
        onError={onImgError}
      />
    );
  }

  return (
    <div className={`relative shrink-0 overflow-visible ${className}`.trim()}>
      <div
        aria-hidden
        className={`absolute inset-0 z-0 rounded-full bg-white ${shadowClassName}`.trim()}
      />

      <div className="absolute inset-0 z-[1] overflow-hidden rounded-full">
        <img
          src={MASCOT_SRC}
          alt={decorative ? "" : alt}
          aria-hidden={decorative ? true : undefined}
          draggable={false}
          className={FRAMED_IMG_CLASS}
          onError={onImgError}
        />
      </div>

      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 z-[2] rounded-full ring-2 ring-inset ${borderClassName}`.trim()}
      />

      <img
        src={MASCOT_SRC}
        alt=""
        aria-hidden
        draggable={false}
        className={`${FRAMED_IMG_CLASS} z-[3] mix-blend-multiply`}
        style={{
          WebkitMaskImage:
            "radial-gradient(circle closest-side at 50% 43.7%, transparent 68%, #000 71%), linear-gradient(to bottom, #000 0%, #000 75.3%, transparent 75.5%)",
          maskImage:
            "radial-gradient(circle closest-side at 50% 43.7%, transparent 68%, #000 71%), linear-gradient(to bottom, #000 0%, #000 75.3%, transparent 75.5%)",
          WebkitMaskComposite: "source-in",
          maskComposite: "intersect",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskSize: "100% 100%",
          maskSize: "100% 100%"
        }}
        onError={onImgError}
      />
    </div>
  );
}
