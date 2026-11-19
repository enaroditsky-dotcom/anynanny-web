"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AUTH_RETRY_MESSAGE, createAuthRetryScheduler, type AuthRetryScheduler } from "@/lib/auth/auth-retry";

export type OnlineRetryNonce = {
  nonce: number;
  exhausted: boolean;
  /** Schedule the next check after a temporary failure, even if the browser is already online. */
  noteUnavailable: () => void;
  /** Cancel pending retries after verification or a confirmed sign-out. */
  noteSettled: () => void;
  /** Start a new bounded sequence after the automatic budget is used up. */
  retryNow: () => void;
};

/**
 * Bumps `nonce` when an auth check should run again.
 * The browser `online` event is an extra trigger. Recovery from a server blip
 * does not depend on the browser online flag flipping.
 */
export function useOnlineRetryNonce(): OnlineRetryNonce {
  const [nonce, setNonce] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const schedulerRef = useRef<AuthRetryScheduler | null>(null);

  if (schedulerRef.current == null) {
    schedulerRef.current = createAuthRetryScheduler({
      setTimer: (delayMs, fn) => window.setTimeout(fn, delayMs),
      clearTimer: (id) => window.clearTimeout(id),
      onRetry: () => setNonce((current) => current + 1),
      onExhausted: () => setExhausted(true)
    });
  }

  useEffect(() => {
    const scheduler = schedulerRef.current;
    const onOnline = () => {
      scheduler?.retryNow();
      setExhausted(false);
      setNonce((current) => current + 1);
    };
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      scheduler?.dispose();
    };
  }, []);

  const noteUnavailable = useCallback(() => {
    schedulerRef.current?.noteUnavailable();
  }, []);

  const noteSettled = useCallback(() => {
    schedulerRef.current?.noteSettled();
    setExhausted(false);
  }, []);

  const retryNow = useCallback(() => {
    schedulerRef.current?.retryNow();
    setExhausted(false);
    setNonce((current) => current + 1);
  }, []);

  return { nonce, exhausted, noteUnavailable, noteSettled, retryNow };
}

export function AuthRetryStatus({
  exhausted,
  onRetry,
  pending = "טוען…"
}: {
  exhausted: boolean;
  onRetry: () => void;
  pending?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-center text-sm text-slate-600">{exhausted ? AUTH_RETRY_MESSAGE : pending}</p>
      {exhausted ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-xl bg-navy-header px-4 py-2 text-sm font-bold text-white"
        >
          נסו שוב
        </button>
      ) : null}
    </div>
  );
}
