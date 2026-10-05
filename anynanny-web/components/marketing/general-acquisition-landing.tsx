import { ChevronLeft, Download, Play } from "lucide-react";
import { STORY_FONT_FILES } from "@/components/marketing/story-rubik";
import {
  GENERAL_ACQUISITION_ANNY_ALT,
  GENERAL_ACQUISITION_ANNY_SIZE,
  GENERAL_ACQUISITION_ANNY_SRC,
  GENERAL_ACQUISITION_DIRECT,
  GENERAL_ACQUISITION_H1_FIND,
  GENERAL_ACQUISITION_H1_WORK,
  GENERAL_ACQUISITION_HERO_ALT,
  GENERAL_ACQUISITION_HERO_HEIGHT,
  GENERAL_ACQUISITION_HERO_SRC,
  GENERAL_ACQUISITION_HERO_WIDTH,
  GENERAL_ACQUISITION_PARENT_COPY,
  GENERAL_ACQUISITION_PARENT_DEMO_CTA,
  GENERAL_ACQUISITION_PARENT_HEADING,
  GENERAL_ACQUISITION_SITTER_COPY,
  GENERAL_ACQUISITION_SITTER_DEMO_CTA,
  GENERAL_ACQUISITION_SITTER_HEADING,
  GENERAL_ACQUISITION_STORE_NOTE,
  GENERAL_ACQUISITION_STUDENT_JOBS_HREF,
  GENERAL_ACQUISITION_STUDENT_JOBS_LABEL,
  GENERAL_ACQUISITION_WEB_APP_CTA,
  GENERAL_ACQUISITION_WORDMARK_ALT,
  GENERAL_ACQUISITION_WORDMARK_HEIGHT,
  GENERAL_ACQUISITION_WORDMARK_SRC,
  GENERAL_ACQUISITION_WORDMARK_WIDTH
} from "@/lib/marketing/general-acquisition";
import styles from "./general-acquisition-landing.module.css";

export function GeneralAcquisitionLanding({
  webAppHref,
  parentDemoHref,
  sitterDemoHref
}: {
  webAppHref: string;
  parentDemoHref: string;
  sitterDemoHref: string;
}) {
  return (
    <div className={styles.page} dir="rtl">
      {STORY_FONT_FILES.map((href) => (
        <link key={href} rel="preload" href={href} as="font" type="font/ttf" crossOrigin="anonymous" />
      ))}

      <header className={styles.header}>
        <a
          href={webAppHref}
          className={styles.lockup}
          data-cta="web-app"
          data-cta-placement="brand"
          aria-label={`${GENERAL_ACQUISITION_ANNY_ALT}. ${GENERAL_ACQUISITION_WORDMARK_ALT}`}
        >
          <img
            className={styles.anny}
            src={GENERAL_ACQUISITION_ANNY_SRC}
            alt={GENERAL_ACQUISITION_ANNY_ALT}
            width={GENERAL_ACQUISITION_ANNY_SIZE}
            height={GENERAL_ACQUISITION_ANNY_SIZE}
            decoding="async"
            fetchPriority="high"
          />
          <img
            className={styles.wordmark}
            src={GENERAL_ACQUISITION_WORDMARK_SRC}
            alt={GENERAL_ACQUISITION_WORDMARK_ALT}
            width={GENERAL_ACQUISITION_WORDMARK_WIDTH}
            height={GENERAL_ACQUISITION_WORDMARK_HEIGHT}
            dir="ltr"
            decoding="async"
            fetchPriority="high"
          />
        </a>
      </header>

      <main className={styles.main}>
        <h1 className={styles.heroTitle}>
          <span className={styles.h1Find}>{GENERAL_ACQUISITION_H1_FIND}</span>{" "}
          <span className={styles.h1Work}>{GENERAL_ACQUISITION_H1_WORK}</span>
        </h1>

        <p className={styles.differentiator}>
          <span className={styles.diffLine}>
            <span className={styles.red}>בלי מנוי</span>{" "}
            <span className={styles.navy}>כדי לראות.</span>
          </span>{" "}
          <span className={styles.diffLine}>
            <span className={styles.red}>בלי תשלום</span>{" "}
            <span className={styles.navy}>כדי לפנות.</span>
          </span>
        </p>

        <p className={styles.direct}>{GENERAL_ACQUISITION_DIRECT}</p>

        <figure className={styles.scene}>
          <img
            src={GENERAL_ACQUISITION_HERO_SRC}
            alt={GENERAL_ACQUISITION_HERO_ALT}
            width={GENERAL_ACQUISITION_HERO_WIDTH}
            height={GENERAL_ACQUISITION_HERO_HEIGHT}
            decoding="async"
            fetchPriority="high"
            data-asset-required="general-acquisition-hero"
          />
          <p className={styles.phoneLine}>פשוט למצוא זמן לחיים</p>
        </figure>

        <div className={styles.actions}>
          <a className={styles.primaryCta} href={webAppHref} data-cta="web-app" data-cta-placement="primary">
            <Download aria-hidden className={styles.ctaIcon} />
            <span>{GENERAL_ACQUISITION_WEB_APP_CTA}</span>
            <ChevronLeft aria-hidden className={styles.ctaIcon} />
          </a>

          <a className={styles.parentDemo} href={parentDemoHref} data-cta="parent-demo">
            <Play aria-hidden className={styles.demoIcon} />
            <span>{GENERAL_ACQUISITION_PARENT_DEMO_CTA}</span>
          </a>

          <a className={styles.sitterDemo} href={sitterDemoHref} data-cta="sitter-demo">
            <Play aria-hidden className={styles.demoIcon} />
            <span>{GENERAL_ACQUISITION_SITTER_DEMO_CTA}</span>
          </a>

          <a className={styles.phonePanel} href={webAppHref} data-cta="web-app" data-cta-placement="phone">
            <Download aria-hidden className={styles.phonePanelIcon} />
            <span className={styles.phonePanelTitle}>{GENERAL_ACQUISITION_WEB_APP_CTA}</span>
          </a>

          <p className={styles.storeNote}>{GENERAL_ACQUISITION_STORE_NOTE}</p>
        </div>

        <section className={styles.parentIntent} aria-labelledby="parent-intent-heading">
          <h2 id="parent-intent-heading">{GENERAL_ACQUISITION_PARENT_HEADING}</h2>
          <p>{GENERAL_ACQUISITION_PARENT_COPY}</p>
        </section>

        <section className={styles.sitterIntent} aria-labelledby="sitter-intent-heading">
          <h2 id="sitter-intent-heading">{GENERAL_ACQUISITION_SITTER_HEADING}</h2>
          <p>{GENERAL_ACQUISITION_SITTER_COPY}</p>
        </section>

        <nav className={styles.related} aria-label="עמודים קשורים">
          <a href={GENERAL_ACQUISITION_STUDENT_JOBS_HREF}>{GENERAL_ACQUISITION_STUDENT_JOBS_LABEL}</a>
        </nav>
      </main>
    </div>
  );
}
