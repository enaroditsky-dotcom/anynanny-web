"use client";

import { useCallback, useRef, useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import {
  WELCOME_HOMEPAGE_PLAY_LABEL,
  WELCOME_HOMEPAGE_REPLAY_LABEL,
  WELCOME_VIDEO_ARIA_LABEL,
  WELCOME_VIDEO_SRC
} from "@/lib/welcome/constants";

type HomepageWelcomeVideoProps = {
  onJoinClick?: () => void;
};

export function HomepageWelcomeVideo({ onJoinClick }: HomepageWelcomeVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const showTeaser = !hasStarted || hasEnded;

  const startPlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.ended || video.currentTime > 0.2) {
      video.currentTime = 0;
    }

    setHasEnded(false);
    setHasStarted(true);

    try {
      await video.play();
    } catch {
      /* Native controls remain available after the first successful gesture. */
    }
  }, []);

  return (
    <section className="w-full shrink-0" aria-labelledby="homepage-welcome-video-title">
      <div className="px-1 text-center">
        <h2
          id="homepage-welcome-video-title"
          className="text-[15px] font-extrabold leading-snug tracking-tight text-navy-header sm:text-base"
        >
          הכירו את AnyNanny ב־10 שניות
        </h2>
      </div>

      <div className="mt-2 overflow-hidden rounded-2xl border border-[#001F3F]/10 bg-white shadow-soft sm:rounded-3xl">
        <div className="relative aspect-video w-full overflow-hidden bg-[#0B243B]">
          <video
            ref={videoRef}
            src={WELCOME_VIDEO_SRC}
            className="h-full w-full object-contain"
            playsInline
            preload="metadata"
            controls={hasStarted && !hasEnded}
            controlsList="nodownload"
            disablePictureInPicture
            aria-label={WELCOME_VIDEO_ARIA_LABEL}
            onEnded={() => setHasEnded(true)}
            onPlay={() => setHasEnded(false)}
          />

          <div
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ease-out ${
              showTeaser ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            aria-hidden={!showTeaser}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-[#001F3F]/80 via-[#001F3F]/35 to-[#001F3F]/15" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,138,138,0.16),transparent_62%)]" />

            <span className="absolute top-3 start-3 z-10 rounded-full border border-white/70 bg-white/90 px-2.5 py-1 text-[11px] font-bold tracking-wide text-navy-header shadow-sm">
              10 שניות
            </span>

            <button
              type="button"
              onClick={startPlayback}
              tabIndex={showTeaser ? 0 : -1}
              aria-label={hasEnded ? WELCOME_HOMEPAGE_REPLAY_LABEL : WELCOME_HOMEPAGE_PLAY_LABEL}
              className="group relative z-10 flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-white text-navy-header shadow-[0_10px_28px_rgba(0,31,63,0.32)] ring-4 ring-white/35 transition duration-200 hover:scale-105 hover:shadow-[0_12px_32px_rgba(255,138,138,0.35)] focus-visible:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF8A8A]/70 sm:h-[4.75rem] sm:w-[4.75rem]"
            >
              {hasEnded ? (
                <RotateCcw className="h-7 w-7" aria-hidden />
              ) : (
                <Play className="ms-0.5 h-8 w-8 fill-current" aria-hidden />
              )}
            </button>
          </div>
        </div>
      </div>

      {onJoinClick ? (
        <p className="mt-2 text-center">
          <button
            type="button"
            onClick={onJoinClick}
            className="text-[12px] font-bold text-navy-header underline decoration-[#FF8A8A]/70 decoration-2 underline-offset-4 transition hover:text-[#C45C5C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8A8A]/70 sm:text-[13px]"
          >
            רוצים להצטרף? התחילו כאן
          </button>
        </p>
      ) : null}
    </section>
  );
}
