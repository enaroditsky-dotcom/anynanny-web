"use client";

import { useEffect, useRef, useState } from "react";
import {
  PARENTS_LANDING_ALREADY_INSTALLED_NOTE,
  PARENTS_LANDING_IOS_INSTALL_NOTE
} from "@/lib/marketing/parents-landing";
import { isIosLikeUserAgent, isStandaloneDisplayMode } from "@/lib/push/capability";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Green hero control for the parent landing.
 * The project has no shared deferred-install helper. This button captures
 * `beforeinstallprompt` on the page and calls it. iOS uses the existing
 * Home Screen instruction. Other browsers without a prompt open the existing
 * Web App entry (`/`), never an app store.
 */
export function ParentsWebAppInstallButton({
  className,
  noteClassName,
  fallbackHref
}: {
  className: string;
  noteClassName: string;
  fallbackHref: string;
}) {
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as BeforeInstallPromptEvent;
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function onClick() {
    const deferred = promptRef.current;
    if (deferred) {
      promptRef.current = null;
      await deferred.prompt();
      setNote(null);
      return;
    }

    const nav = window.navigator;
    const ios = isIosLikeUserAgent(nav.userAgent ?? "", nav.maxTouchPoints ?? 0, nav.platform ?? "");
    const standalone = isStandaloneDisplayMode(
      typeof window.matchMedia === "function" &&
        window.matchMedia("(display-mode: standalone)").matches,
      Boolean((nav as Navigator & { standalone?: boolean }).standalone)
    );

    if (standalone) {
      setNote(PARENTS_LANDING_ALREADY_INSTALLED_NOTE);
      return;
    }

    if (ios) {
      setNote(PARENTS_LANDING_IOS_INSTALL_NOTE);
      return;
    }

    if (fallbackHref.startsWith("/") && !fallbackHref.startsWith("//")) {
      window.location.assign(fallbackHref);
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        aria-label="להתקנת AnyNanny כ-Web App"
        data-hero-hit="web-app"
        onClick={() => {
          void onClick();
        }}
      />
      {note ? (
        <p className={noteClassName} role="status">
          {note}
        </p>
      ) : null}
    </>
  );
}
