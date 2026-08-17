import type { CSSProperties } from "react";

const STRAIGHT: CSSProperties = {
  fontStyle: "normal",
  transform: "none"
};

const NOW_TYPE: CSSProperties = {
  fontFamily:
    '"Arial Black", "Arial Bold", Impact, "Franklin Gothic Heavy", "Helvetica Neue", sans-serif',
  fontStyle: "normal",
  fontWeight: 900,
  transform: "none",
  whiteSpace: "nowrap",
  lineHeight: 1,
  letterSpacing: "-1px",
  color: "#FFFFFF",
  WebkitTextStroke: "1.25px rgba(0,45,75,0.70)",
  paintOrder: "stroke fill",
  textShadow: "0 2px 3px rgba(0,40,55,0.35), 0 4px 8px rgba(0,50,45,0.18)"
};

/** Decorative AnyNanny NOW FLASH emblem. No interaction. */
export function AnyNannyNowHero() {
  return (
    <div
      className="relative mx-auto mt-2 flex w-full flex-col items-center"
      aria-hidden
    >
      <p
        dir="ltr"
        className="relative z-20 whitespace-nowrap text-center text-[28px] font-semibold leading-[1.1] tracking-normal not-italic min-[430px]:text-[30px]"
        style={STRAIGHT}
      >
        <span className="text-[#001F3F]">Any</span>
        <span className="text-[#00A86B]">Nanny</span>
      </p>

      <div className="relative z-10 mt-1 h-[178px] w-[178px] min-[430px]:h-[185px] min-[430px]:w-[185px]">
        <span
          className="pointer-events-none absolute inset-[-22%] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(0,168,107,0.38) 0%, rgba(0,168,107,0.12) 42%, transparent 70%)"
          }}
        />

        <div
          className="absolute inset-0 overflow-hidden rounded-full"
          style={{
            aspectRatio: "1 / 1",
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 35% 25%, #6DF3A9 0%, #1ED47A 40%, #00A86B 58%, #0EA05A 78%, #0A7A45 100%)",
            boxShadow: [
              "0 20px 28px -10px rgba(4, 80, 55, 0.55)",
              "0 10px 14px -8px rgba(0, 31, 63, 0.22)",
              "0 0 22px rgba(0, 168, 107, 0.28)",
              "inset 0 10px 14px rgba(255, 255, 255, 0.28)",
              "inset 0 -18px 22px rgba(0, 40, 24, 0.42)",
              "inset 8px 0 16px rgba(255, 255, 255, 0.08)"
            ].join(", ")
          }}
        >
          <span
            className="pointer-events-none absolute left-[14%] top-[8%] h-[42%] w-[52%] rounded-full"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.12) 42%, transparent 70%)"
            }}
          />
          <span
            className="pointer-events-none absolute left-[12%] top-[46%] h-[9%] w-[70%] rounded-full"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.32) 45%, transparent 100%)"
            }}
          />

          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-1/2 top-1/2 z-[1] h-[78%] w-[78%] -translate-x-1/2 -translate-y-1/2"
            style={{
              opacity: 0.95,
              filter:
                "drop-shadow(0 0 5px rgba(255,255,255,0.9)) drop-shadow(0 0 12px rgba(255,255,255,0.55))"
            }}
          >
            <path
              d="M13 2 4 14h6.5L9 22l11-13h-6.5L13 2Z"
              fill="#FFFFFF"
            />
          </svg>

          <span
            dir="ltr"
            className="absolute inset-0 z-[3] flex items-center justify-center text-center text-[50px] not-italic min-[390px]:text-[54px] min-[430px]:text-[58px]"
            style={NOW_TYPE}
          >
            NOW!
          </span>
        </div>
      </div>
    </div>
  );
}
