"use client";

import {
  DOWNLOAD_CLICK_PATH,
  DOWNLOAD_LANDING_APP_STORE_LABEL,
  DOWNLOAD_LANDING_GOOGLE_PLAY_LABEL,
  DOWNLOAD_LANDING_H1,
  DOWNLOAD_LANDING_POSTER_ALT,
  DOWNLOAD_LANDING_POSTER_HEIGHT,
  DOWNLOAD_LANDING_POSTER_SRC,
  DOWNLOAD_LANDING_POSTER_WIDTH,
  DOWNLOAD_STORE_HIT_BOXES,
  type DownloadStorePlatform
} from "@/lib/marketing/parent-download";
import styles from "./parent-download-landing.module.css";

function reportDownloadClick(platform: DownloadStorePlatform) {
  const payload = JSON.stringify({
    platform,
    search: window.location.search
  });
  const blob = new Blob([payload], { type: "application/json" });
  if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon(DOWNLOAD_CLICK_PATH, blob)) {
    return;
  }
  void fetch(DOWNLOAD_CLICK_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true
  }).catch(() => undefined);
}

function StoreHit({
  platform,
  href,
  label
}: {
  platform: DownloadStorePlatform;
  href: string;
  label: string;
}) {
  const box = DOWNLOAD_STORE_HIT_BOXES[platform];
  return (
    <a
      className={styles.hit}
      style={{
        left: `${box.left}%`,
        top: `${box.top}%`,
        width: `${box.width}%`,
        height: `${box.height}%`
      }}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-cta={platform === "app_store" ? "app-store" : "google-play"}
      data-platform={platform}
      onClick={() => reportDownloadClick(platform)}
    >
      <span className={styles.hitLabel}>{label}</span>
    </a>
  );
}

export function ParentDownloadLanding({
  appStoreHref,
  playHref
}: {
  appStoreHref: string;
  playHref: string;
}) {
  return (
    <main className={styles.page} dir="rtl">
      <h1 className={styles.title}>{DOWNLOAD_LANDING_H1}</h1>
      <figure className={styles.poster}>
        <img
          src={DOWNLOAD_LANDING_POSTER_SRC}
          alt={DOWNLOAD_LANDING_POSTER_ALT}
          width={DOWNLOAD_LANDING_POSTER_WIDTH}
          height={DOWNLOAD_LANDING_POSTER_HEIGHT}
          decoding="async"
          fetchPriority="high"
        />
        <StoreHit platform="app_store" href={appStoreHref} label={DOWNLOAD_LANDING_APP_STORE_LABEL} />
        <StoreHit platform="google_play" href={playHref} label={DOWNLOAD_LANDING_GOOGLE_PLAY_LABEL} />
      </figure>
    </main>
  );
}
