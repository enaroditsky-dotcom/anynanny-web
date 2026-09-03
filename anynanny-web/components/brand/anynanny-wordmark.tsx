type AnyNannyWordmarkProps = {
  className?: string;
  /** Tailwind text-size classes for the lettering. */
  textClassName?: string;
};

/**
 * Canonical AnyNanny wordmark: navy "Any" + jade "Nanny" with the heart-like
 * brand stroke. Colors match `MainLayout` / `AnyNannyNowHero` (`#001F3F`, `#00A86B`)
 * and brand salmon (`#FF8A8A`) for the heart.
 */
export function AnyNannyWordmark({
  className = "",
  textClassName = "text-3xl sm:text-4xl"
}: AnyNannyWordmarkProps) {
  return (
    <span
      dir="ltr"
      role="img"
      aria-label="AnyNanny"
      className={`inline-flex flex-col items-center ${className}`.trim()}
    >
      <span
        className={`flex font-black leading-none tracking-tight select-none ${textClassName}`}
        aria-hidden="true"
      >
        <span className="text-[#001F3F]">Any</span>
        <span className="text-[#00A86B]">Nanny</span>
      </span>
      <svg
        viewBox="0 0 240 18"
        className="mt-[2px] h-[14px] w-[min(100%,13.75rem)] sm:h-[16px]"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M10 7.5 C 58 15.5, 92 16, 112 10.5 C 150 16.5, 186 15.5, 230 7.5"
          fill="none"
          stroke="#00A86B"
          strokeWidth="2.35"
          strokeLinecap="round"
        />
        <path
          d="M120 5.2 C 117.2 2.2, 112.4 2.6, 112.6 6.6 C 112.8 10.2, 120 14.8, 120 14.8 C 120 14.8, 127.2 10.2, 127.4 6.6 C 127.6 2.6, 122.8 2.2, 120 5.2 Z"
          fill="#FF8A8A"
        />
      </svg>
    </span>
  );
}
