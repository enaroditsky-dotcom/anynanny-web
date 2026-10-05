import { ChevronLeft, Download, Play } from "lucide-react";
import { STORY_FONT_FILES } from "@/components/marketing/story-rubik";
import {
  BABYSITTER_CITIES,
  babysitterCityPath,
  getNearbyBabysitterCities,
  type BabysitterCity
} from "@/lib/marketing/babysitter-cities";
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
  GENERAL_ACQUISITION_PATH,
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
  sitterDemoHref,
  city
}: {
  webAppHref: string;
  parentDemoHref: string;
  sitterDemoHref: string;
  city?: BabysitterCity;
}) {
  const h1Find = city?.h1Find ?? GENERAL_ACQUISITION_H1_FIND;
  const h1Work = city?.h1Work ?? GENERAL_ACQUISITION_H1_WORK;
  const heroAlt = city?.heroAlt ?? GENERAL_ACQUISITION_HERO_ALT;
  const parentHeading = city?.parentHeading ?? GENERAL_ACQUISITION_PARENT_HEADING;
  const parentCopy = city?.parentCopy ?? GENERAL_ACQUISITION_PARENT_COPY;
  const sitterHeading = city?.sitterHeading ?? GENERAL_ACQUISITION_SITTER_HEADING;
  const sitterCopy = city?.sitterCopy ?? GENERAL_ACQUISITION_SITTER_COPY;
  const nearby = city ? getNearbyBabysitterCities(city) : [];

  return (
    <div className={styles.page} dir="rtl" data-city={city?.slug}>
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
        <h1 className={city ? `${styles.heroTitle} ${styles.heroTitleCity}` : styles.heroTitle}>
          <span className={styles.h1Find}>{h1Find}</span>{" "}
          <span className={styles.h1Work}>{h1Work}</span>
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
            alt={heroAlt}
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
          <h2 id="parent-intent-heading">{parentHeading}</h2>
          <p>{parentCopy}</p>
        </section>

        <section className={styles.sitterIntent} aria-labelledby="sitter-intent-heading">
          <h2 id="sitter-intent-heading">{sitterHeading}</h2>
          <p>{sitterCopy}</p>
        </section>

        {city ? <p className={styles.localNote}>{city.localNote}</p> : null}

        {nearby.length > 0 ? (
          <nav className={styles.nearby} aria-labelledby="nearby-cities-heading">
            <h2 id="nearby-cities-heading">מחפשים גם באזור?</h2>
            <ul>
              {nearby.map((item) => (
                <li key={item.slug}>
                  <a href={babysitterCityPath(item.slug)}>{`בייביסיטר ${item.inCityHe}`}</a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {city ? (
          <nav className={styles.crumbs} aria-label="פירורי לחם">
            <ol>
              <li>
                <a href="/">AnyNanny</a>
              </li>
              <li>
                <a href={GENERAL_ACQUISITION_PATH}>בייביסיטר</a>
              </li>
              <li aria-current="page">{`בייביסיטר ${city.inCityHe}`}</li>
            </ol>
          </nav>
        ) : null}

        <nav className={styles.related} aria-label="עמודים קשורים">
          <a href={GENERAL_ACQUISITION_STUDENT_JOBS_HREF}>{GENERAL_ACQUISITION_STUDENT_JOBS_LABEL}</a>
        </nav>

        {city ? null : (
          <nav className={styles.cityIndex} aria-labelledby="babysitter-cities-heading">
            <h2 id="babysitter-cities-heading">בייביסיטר לפי עיר</h2>
            <ul>
              {BABYSITTER_CITIES.map((item) => (
                <li key={item.slug}>
                  <a href={babysitterCityPath(item.slug)}>{`בייביסיטר ${item.inCityHe}`}</a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </main>
    </div>
  );
}
