import { areSoundAlertsEnabled } from "@/lib/settings/notification-preferences";

/**
 * One short in-app tone, matching the existing AnyNanny Now oscillator.
 * A blocked autoplay attempt must not affect the Nanny Talks modal.
 */
export function playBroadcastArrivalTone(): void {
  if (typeof window === "undefined" || !areSoundAlertsEnabled()) return;

  try {
    const AudioCtx =
      window.AudioContext ||
      (
        window as unknown as {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!AudioCtx) return;

    const audioCtx = new AudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(659.25, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch {
    /* The visual modal remains usable when the browser blocks audio. */
  }
}
