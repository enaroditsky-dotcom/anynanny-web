export const ANYNANNY_ENTRY_ILLUSTRATION_SRC = encodeURI(
  "/brand/AnyNanny logo new.png"
);
export const ANYNANNY_ENTRY_WORDMARK_SRC = encodeURI(
  "/brand/anynanny-official-wordmark new.png"
);

/**
 * Public login / registration entry lockup.
 * Illustration above the official wordmark, both at their native aspect ratios.
 */
export function AnyNannyEntryBrand() {
  return (
    <div className="flex w-full min-w-0 flex-col items-center">
      <img
        src={ANYNANNY_ENTRY_ILLUSTRATION_SRC}
        alt=""
        aria-hidden
        draggable={false}
        decoding="async"
        fetchPriority="high"
        className="pointer-events-none block h-auto w-[clamp(10.5rem,52vw,13.75rem)] max-w-full shrink-0 bg-transparent object-contain object-center select-none sm:w-[8.25rem]"
        style={{ aspectRatio: "1 / 1" }}
      />
      <h1 className="mt-1 flex w-full min-w-0 justify-center sm:mt-[0.325rem]">
        <span
          className="inline-block w-[min(100%,18.75rem)] max-w-full bg-transparent sm:w-[13.65rem]"
          style={{ aspectRatio: "2172 / 724" }}
        >
          <img
            src={ANYNANNY_ENTRY_WORDMARK_SRC}
            alt="AnyNanny"
            dir="ltr"
            draggable={false}
            decoding="async"
            fetchPriority="high"
            className="block h-full w-full max-h-full max-w-full bg-transparent object-contain object-center select-none"
          />
        </span>
      </h1>
    </div>
  );
}
