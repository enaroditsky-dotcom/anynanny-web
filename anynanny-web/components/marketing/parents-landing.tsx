"use client";

import { AnyNannyLogo } from "@/components/brand/anynanny-logo";
import { AnynannyMascotPortrait } from "@/components/brand/anynanny-mascot-portrait";
import { MarketingHomeReturn } from "@/components/marketing/marketing-home-return";
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
import { MarketingPrivacyLink } from "@/components/marketing/marketing-privacy-link";
import { withStoreCampaign } from "@/lib/marketing/site-nav";
import styles from "./parents-landing.module.css";

export function ParentsLanding({
  parentHref,
  webAppHref,
  campaignSearch = ""
}: {
  parentHref: string;
  webAppHref: string;
  campaignSearch?: string;
}) {
  const appStoreHref = withStoreCampaign(PARENTS_LANDING_APP_STORE_URL, campaignSearch);
  const playHref = withStoreCampaign(PARENTS_LANDING_GOOGLE_PLAY_URL, campaignSearch);
  return (
    <div className={styles.page} dir="rtl">
      <header className={styles.header}>
        <a className={styles.lockup} href={PARENTS_LANDING_SITE_URL} aria-label="AnyNanny.org">
          <AnynannyMascotPortrait framed={false} alt={PARENTS_LANDING_ANNY_ALT} className={styles.anny} />
          <AnyNannyLogo variant="header" />
        </a>
      </header>

      <main className={styles.main}>
        <MarketingHomeReturn />
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
            href={appStoreHref}
            target="_blank"
            rel="noopener noreferrer"
            data-cta="app-store"
            data-hero-hit="app-store"
          >
            <img src="/brand/app-store-badge-he.svg" alt="הורדת AnyNanny ב-App Store" width={122} height={42} />
          </a>
          <a
            className={`${styles.heroHit} ${styles.heroGoogle}`}
            href={playHref}
            target="_blank"
            rel="noopener noreferrer"
            data-cta="google-play"
            data-hero-hit="google-play"
          >
            <img src="/brand/google-play-badge-en.png" alt="הורדת AnyNanny ב-Google Play" width={646} height={250} />
          </a>
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

        <a className={styles.parentCta} href={parentHref} data-cta="parent-search" data-press="">
          {PARENTS_LANDING_CTA}
        </a>
      </main>
      <MarketingPrivacyLink />
    </div>
  );
}
