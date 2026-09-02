export type WelcomePlaybackMode = "mandatory" | "replay";

export type WelcomePlaybackEvent =
  | { type: "play" }
  | { type: "ended" }
  | { type: "error" }
  | { type: "timeout" }
  | { type: "autoplay_blocked" }
  | { type: "stall" };

export type WelcomePlaybackStatus = "idle" | "playing" | "completed" | "fallback";

export type WelcomePlaybackState = {
  status: WelcomePlaybackStatus;
  shouldContinue: boolean;
};

export function initialWelcomePlaybackState(): WelcomePlaybackState {
  return { status: "idle", shouldContinue: false };
}

/**
 * Mandatory Welcome playback: completion and every technical failure continue.
 * There is no manual-skip event.
 */
export function reduceWelcomePlayback(
  state: WelcomePlaybackState,
  event: WelcomePlaybackEvent,
  mode: WelcomePlaybackMode
): WelcomePlaybackState {
  if (state.shouldContinue && mode === "mandatory") {
    return state;
  }

  if (mode === "replay") {
    if (event.type === "play") {
      return { status: "playing", shouldContinue: false };
    }
    if (event.type === "ended") {
      return { status: "completed", shouldContinue: false };
    }
    if (event.type === "error" || event.type === "timeout" || event.type === "autoplay_blocked" || event.type === "stall") {
      return { status: "fallback", shouldContinue: false };
    }
    return state;
  }

  switch (event.type) {
    case "play":
      return { status: "playing", shouldContinue: false };
    case "ended":
      return { status: "completed", shouldContinue: true };
    case "error":
    case "timeout":
    case "autoplay_blocked":
    case "stall":
      return { status: "fallback", shouldContinue: true };
    default:
      return state;
  }
}

export function isManualSkipAllowed(): boolean {
  return false;
}
