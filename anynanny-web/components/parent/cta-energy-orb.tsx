/** Decorative CTA energy control. No interaction. */
export function CtaEnergyOrb() {
  return (
    <span
      className="pointer-events-none absolute left-0 top-1/2 z-10 h-[62px] w-[62px] -translate-x-[38%] -translate-y-1/2"
      aria-hidden
    >
      <span
        className="relative block h-full w-full rounded-full p-[3px]"
        style={{
          background:
            "linear-gradient(165deg, #0d9a5e 0%, #07824D 48%, #087A4A 100%)",
          boxShadow:
            "0 0 8px rgba(0, 200, 120, 0.35), 0 5px 10px rgba(0, 80, 50, 0.30)"
        }}
      >
        <span
          className="block h-full w-full rounded-full p-px"
          style={{
            background:
              "linear-gradient(155deg, rgba(255,255,255,0.72) 0%, rgba(200,255,220,0.28) 38%, rgba(255,255,255,0.06) 100%)"
          }}
        >
          <span
            className="relative block h-full w-full overflow-hidden rounded-full"
            style={{
              background:
                "radial-gradient(circle at 32% 25%, #8BFF8A 0%, #39E75F 25%, #12B84F 55%, #087B38 82%, #045A2A 100%)",
              boxShadow:
                "inset 0 2px 4px rgba(255,255,255,0.30), inset 0 -6px 10px rgba(0, 70, 35, 0.35)"
            }}
          >
            <span
              className="absolute left-[10%] top-[8%] h-[40%] w-[50%] rounded-full"
              style={{
                background:
                  "radial-gradient(ellipse at center, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.08) 48%, transparent 72%)",
                filter: "blur(0.6px)"
              }}
            />
            <svg
              viewBox="0 0 24 24"
              className="absolute left-1/2 top-1/2 z-10 h-[52%] w-[52%] -translate-x-1/2 -translate-y-1/2"
              style={{
                filter:
                  "drop-shadow(0 0 3px rgba(255,255,255,1)) drop-shadow(0 0 7px rgba(255,255,255,0.75))"
              }}
            >
              <path d="M13 2 4 14h6.5L9 22l11-13h-6.5L13 2Z" fill="#FFFFFF" />
            </svg>
          </span>
        </span>
      </span>
    </span>
  );
}
