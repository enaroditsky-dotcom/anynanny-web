"use client";

import { DiditSdk, type VerificationResult } from "@didit-protocol/sdk-web";

export async function startDiditVerification(
  url: string,
  onComplete?: (result: VerificationResult) => void
): Promise<void> {
  DiditSdk.shared.onComplete = (result) => {
    onComplete?.(result);
  };
  await DiditSdk.shared.startVerification({
    url,
    configuration: {
      closeModalOnComplete: true,
      zIndex: 200
    }
  });
}

export function VerifyButton() {
  async function start() {
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({})
    });
    const { url } = (await res.json()) as { url?: string };
    if (!url) return;
    DiditSdk.shared.onComplete = (result) => {
      // result.type: "completed" | "cancelled" | "failed" — UI hint only.
      // The webhook is the source of truth for the verification decision.
      console.log("flow finished:", result.type);
    };
    await DiditSdk.shared.startVerification({ url });
  }
  return (
    <button type="button" onClick={() => void start()}>
      Verify my identity
    </button>
  );
}
