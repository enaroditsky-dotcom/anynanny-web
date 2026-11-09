"use client";

import { useEffect, useRef, useState } from "react";
import { DOMAIN_SEPARATION_ENABLED } from "@/lib/hosts/site-classifier";
import { WEB_APP_ORIGIN } from "@/lib/marketing/general-acquisition";
import {
  PARENTS_LANDING_ALREADY_INSTALLED_NOTE,
  PARENTS_LANDING_IOS_INSTALL_NOTE
} from "@/lib/marketing/parents-landing";
import { isIosLikeUserAgent, isStandaloneDisplayMode } from "@/lib/push/capability";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isCurrentWebAppOrigin(): boolean {
  return window.location.origin === WEB_APP_ORIGIN;
}

/** Browsers install only the document origin. Refuse every other host. */
function assignWebAppEntry(href: string) {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return;
  }
  if (url.origin !== WEB_APP_ORIGIN || url.username || url.password) return;
  window.location.assign(url.href);
}

/**
 * Green hero control for the parent landing.
 * While domain separation is off, this captures `beforeinstallprompt` on the
 * current origin, shows the iOS Home Screen note, and otherwise opens `/`.
 * Once separation is on, install runs only on `app.anynanny.org`. On the
 * marketing origin the control opens that app entry instead of installing www.
 * It never opens an app store.
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
    if (DOMAIN_SEPARATION_ENABLED && !isCurrentWebAppOrigin()) return;
    const onPrompt = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as BeforeInstallPromptEvent;
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function onClick() {
    if (DOMAIN_SEPARATION_ENABLED && !isCurrentWebAppOrigin()) {
      assignWebAppEntry(fallbackHref);
      return;
    }

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
