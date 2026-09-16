"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import {
  generateMarketingLikeToken,
  MARKETING_LIKE_CONFIRMED_STORAGE_KEY,
  MARKETING_LIKE_ERROR_MESSAGE,
  MARKETING_LIKE_SUCCESS_MESSAGE,
  MARKETING_LIKE_TOKEN_STORAGE_KEY,
  MARKETING_LIKE_UNAVAILABLE_MESSAGE
} from "@/lib/marketing/likes";
import styles from "./marketing-home.module.css";

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore quota / private mode */
  }
}

export function MarketingHeartButton() {
  const [pressed, setPressed] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setPressed(readStorage(MARKETING_LIKE_CONFIRMED_STORAGE_KEY) === "1");
  }, []);

  const onClick = async () => {
    if (pressed || pending) return;
    setPending(true);
    setStatus("");
    let token = readStorage(MARKETING_LIKE_TOKEN_STORAGE_KEY);
    if (!token) {
      token = generateMarketingLikeToken();
      writeStorage(MARKETING_LIKE_TOKEN_STORAGE_KEY, token);
    }

    try {
      const response = await fetch("/api/marketing/like", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token })
      });
      if (!response.ok) {
        setPressed(false);
        setStatus(
          response.status === 503
            ? MARKETING_LIKE_UNAVAILABLE_MESSAGE
            : MARKETING_LIKE_ERROR_MESSAGE
        );
        return;
      }
      writeStorage(MARKETING_LIKE_CONFIRMED_STORAGE_KEY, "1");
      setPressed(true);
      setStatus(MARKETING_LIKE_SUCCESS_MESSAGE);
    } catch {
      setPressed(false);
      setStatus(MARKETING_LIKE_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={styles.heartWrap}>
      <button
        type="button"
        className={styles.heartButton}
        aria-label="אהבתי את AnyNanny"
        aria-pressed={pressed}
        aria-busy={pending}
        disabled={pending}
        onClick={() => {
          void onClick();
        }}
      >
        <Heart fill={pressed ? "currentColor" : "none"} strokeWidth={2} aria-hidden />
      </button>
      <p className={styles.srOnly} aria-live="polite">
        {status}
      </p>
    </div>
  );
}
