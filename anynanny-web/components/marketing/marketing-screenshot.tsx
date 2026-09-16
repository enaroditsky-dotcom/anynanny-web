"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { MarketingShot } from "@/lib/marketing/assets";
import styles from "./marketing-home.module.css";

type Props = {
  shot: MarketingShot;
  priority?: boolean;
};

export function MarketingScreenshot({ shot, priority = false }: Props) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = triggerRef.current;
    closeRef.current?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = originalOverflow;
      previous?.focus();
    };
  }, [open]);

  return (
    <figure className={styles.shot}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.shotButton}
        onClick={() => setOpen(true)}
        aria-label={`${shot.alt}. הגדלת התמונה`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shot.src}
          alt={shot.alt}
          width={shot.width}
          height={shot.height}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
        />
      </button>
      <figcaption className={styles.caption}>{shot.caption}</figcaption>
      {open ? (
        <div
          className={styles.lightbox}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={() => setOpen(false)}
        >
          <button
            ref={closeRef}
            type="button"
            className={styles.lightboxClose}
            onClick={() => setOpen(false)}
          >
            סגירה
          </button>
          <figure
            className={styles.lightboxFigure}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
              if (event.key === "Escape") setOpen(false);
            }}
          >
            <p id={titleId} className={styles.srOnly}>
              {shot.alt}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} />
            <figcaption className={styles.caption}>{shot.caption}</figcaption>
          </figure>
        </div>
      ) : null}
    </figure>
  );
}

export function MarketingScreenshotPair({
  shots
}: {
  shots: [MarketingShot, MarketingShot];
}) {
  return (
    <div className={styles.pair}>
      {shots.map((shot) => (
        <MarketingScreenshot key={shot.src} shot={shot} />
      ))}
    </div>
  );
}

export function MarketingScreenshotGallery({ shots }: { shots: MarketingShot[] }) {
  const [index, setIndex] = useState(0);
  if (shots.length === 0) return null;
  const current = shots[index] ?? shots[0];

  return (
    <div>
      <MarketingScreenshot shot={current} />
      {shots.length > 1 ? (
        <div className={styles.galleryControls}>
          <button
            type="button"
            onClick={() => setIndex((value) => (value - 1 + shots.length) % shots.length)}
            aria-label="התמונה הקודמת"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => setIndex((value) => (value + 1) % shots.length)}
            aria-label="התמונה הבאה"
          >
            ‹
          </button>
        </div>
      ) : null}
    </div>
  );
}
