"use client";

import { AnyNannyLogo } from "@/components/brand/anynanny-logo";
import { AnynannyMascotPortrait } from "@/components/brand/anynanny-mascot-portrait";
import { ParentsWebAppInstallButton } from "@/components/marketing/parents-web-app-install-button";
import {
  PARENTS_LANDING_ANNY_ALT,
  PARENTS_LANDING_APP_STORE_URL,
  PARENTS_LANDING_AVAILABILITY,
  PARENTS_LANDING_CTA,
  PARENTS_LANDING_GOOGLE_PLAY_URL,
  PARENTS_LANDING_H1,
  PARENTS_LANDING_HERO_ALT,
  PARENTS_LANDING_HERO_HEIGHT,
  PARENTS_LANDING_HERO_SRC,
  PARENTS_LANDING_HERO_WIDTH,
  PARENTS_LANDING_INTRO,
  PARENTS_LANDING_POINTS,
  PARENTS_LANDING_RATINGS,
  PARENTS_LANDING_REVOLUTION_HEADING,
  PARENTS_LANDING_SIMPLE_HEADING,
  PARENTS_LANDING_SIMPLE_PARAGRAPH,
  PARENTS_LANDING_SITE_URL,
  PARENTS_LANDING_SUPPORTING,
  PARENTS_LANDING_VALUE_HEADING,
  PARENTS_LANDING_VALUE_PARAGRAPH
} from "@/lib/marketing/parents-landing";
import styles from "./parents-landing.module.css";

export function ParentsLanding({
  parentHref,
  webAppHref
}: {
  parentHref: string;
  webAppHref: string;
}) {
  return (
    <div className={styles.page} dir="rtl">
      <header className={styles.header}>
        <a className={styles.lockup} href={PARENTS_LANDING_SITE_URL} aria-label="AnyNanny.org">
          <AnynannyMascotPortrait framed={false} alt={PARENTS_LANDING_ANNY_ALT} className={styles.anny} />
          <AnyNannyLogo variant="header" />
        </a>
      </header>

      <main className={styles.main}>
        <h1 className={styles.heroTitle}>{PARENTS_LANDING_H1}</h1>
        <h2 className={styles.revolution}>{PARENTS_LANDING_REVOLUTION_HEADING}</h2>
        <p className={styles.supporting}>
          <strong>{PARENTS_LANDING_SUPPORTING}</strong>
        </p>
        <p className={styles.intro}>{PARENTS_LANDING_INTRO}</p>

        <figure className={styles.hero}>
          <img
            src={PARENTS_LANDING_HERO_SRC}
            alt={PARENTS_LANDING_HERO_ALT}
            width={PARENTS_LANDING_HERO_WIDTH}
            height={PARENTS_LANDING_HERO_HEIGHT}
            decoding="async"
            fetchPriority="high"
          />
          <ParentsWebAppInstallButton
            className={`${styles.heroHit} ${styles.heroDownload}`}
            noteClassName={styles.installNote}
            fallbackHref={webAppHref}
          />
          <a
            className={`${styles.heroHit} ${styles.heroApple}`}
            href={PARENTS_LANDING_APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="AnyNanny ב-App Store"
            data-hero-hit="app-store"
          />
          {PARENTS_LANDING_GOOGLE_PLAY_URL ? (
            <a
              className={`${styles.heroHit} ${styles.heroGoogle}`}
              href={PARENTS_LANDING_GOOGLE_PLAY_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="AnyNanny ב-Google Play"
              data-hero-hit="google-play"
            />
          ) : null}
        </figure>

        <section className={styles.simple} aria-labelledby="parents-simple-heading">
          <h2 id="parents-simple-heading">{PARENTS_LANDING_SIMPLE_HEADING}</h2>
          <p>{PARENTS_LANDING_SIMPLE_PARAGRAPH}</p>
          <ul>
            {PARENTS_LANDING_POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>

        <section className={styles.value} aria-labelledby="parents-value-heading">
          <h2 id="parents-value-heading">{PARENTS_LANDING_VALUE_HEADING}</h2>
          <p>{PARENTS_LANDING_VALUE_PARAGRAPH}</p>
          <p>{PARENTS_LANDING_RATINGS}</p>
          <p>{PARENTS_LANDING_AVAILABILITY}</p>
        </section>

        <a className={styles.parentCta} href={parentHref} data-cta="parent-search">
          {PARENTS_LANDING_CTA}
        </a>
      </main>
    </div>
  );
}
