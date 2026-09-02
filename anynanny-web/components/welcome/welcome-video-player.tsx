"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  WELCOME_AUTOPLAY_FALLBACK_MS,
  WELCOME_PLAYBACK_TIMEOUT_MS,
  WELCOME_STALL_FALLBACK_MS,
  WELCOME_VIDEO_ARIA_LABEL,
  WELCOME_VIDEO_SRC
} from "@/lib/welcome/constants";
import {
  initialWelcomePlaybackState,
  reduceWelcomePlayback,
  type WelcomePlaybackEvent,
  type WelcomePlaybackMode
} from "@/lib/welcome/playback";

type WelcomeVideoPlayerProps = {
  mode: WelcomePlaybackMode;
  onMandatoryComplete: () => void;
};

export function WelcomeVideoPlayer({ mode, onMandatoryComplete }: WelcomeVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const finishedRef = useRef(false);
  const lastTimeRef = useRef(0);
  const stallTimerRef = useRef<number | null>(null);
  const stateRef = useRef(initialWelcomePlaybackState());

  const finish = useCallback(
    (event: WelcomePlaybackEvent) => {
      if (finishedRef.current) return;
      const next = reduceWelcomePlayback(stateRef.current, event, mode);
      stateRef.current = next;
      if (mode === "mandatory" && next.shouldContinue) {
        finishedRef.current = true;
        onMandatoryComplete();
      }
    },
    [mode, onMandatoryComplete]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    finishedRef.current = false;
    stateRef.current = initialWelcomePlaybackState();
    lastTimeRef.current = 0;

    const clearStallTimer = () => {
      if (stallTimerRef.current != null) {
        window.clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
    };

    const armStallTimer = () => {
      clearStallTimer();
      stallTimerRef.current = window.setTimeout(() => {
        if (cancelled || finishedRef.current) return;
        const current = video.currentTime;
        if (current <= lastTimeRef.current + 0.05) {
          finish({ type: "stall" });
        }
      }, WELCOME_STALL_FALLBACK_MS);
    };

    const onPlaying = () => {
      stateRef.current = reduceWelcomePlayback(stateRef.current, { type: "play" }, mode);
      lastTimeRef.current = video.currentTime;
      armStallTimer();
    };

    const onTimeUpdate = () => {
      lastTimeRef.current = video.currentTime;
      armStallTimer();
    };

    const onEnded = () => {
      clearStallTimer();
      finish({ type: "ended" });
    };

    const onError = () => {
      clearStallTimer();
      finish({ type: "error" });
    };

    video.addEventListener("playing", onPlaying);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);

    const timeoutId = window.setTimeout(() => {
      finish({ type: "timeout" });
    }, WELCOME_PLAYBACK_TIMEOUT_MS);

    const autoplayFallbackId = window.setTimeout(() => {
      if (finishedRef.current || cancelled) return;
      if (video.paused && video.currentTime < 0.2) {
        finish({ type: "autoplay_blocked" });
      }
    }, WELCOME_AUTOPLAY_FALLBACK_MS);

    void video.play().catch(() => {
      finish({ type: "autoplay_blocked" });
    });

    return () => {
      cancelled = true;
      clearStallTimer();
      window.clearTimeout(timeoutId);
      window.clearTimeout(autoplayFallbackId);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
    };
  }, [finish, mode]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-[#0B243B] shadow-soft">
      <video
        ref={videoRef}
        src={WELCOME_VIDEO_SRC}
        className="h-full w-full object-contain"
        playsInline
        preload="auto"
        autoPlay
        muted={false}
        controls={mode === "replay"}
        controlsList={mode === "replay" ? "nodownload" : undefined}
        disablePictureInPicture
        aria-label={WELCOME_VIDEO_ARIA_LABEL}
      />
    </div>
  );
}
