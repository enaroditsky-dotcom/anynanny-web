import { AnyNannyLogo } from "@/components/brand/anynanny-logo";
import {
  APP_LANDING_APP_STORE_URL,
  APP_LANDING_H1,
  APP_LANDING_HERO_ALT,
  APP_LANDING_HERO_HEIGHT,
  APP_LANDING_HERO_SRC,
  APP_LANDING_HERO_WIDTH,
  APP_LANDING_PARENT_CTA,
  APP_LANDING_PARENT_HEADING,
  APP_LANDING_PARENT_NOTE,
  APP_LANDING_PARENT_PARAGRAPHS,
  APP_LANDING_PARENT_POINTS,
  APP_LANDING_PROFILE_HEADING,
  APP_LANDING_PROFILE_PARAGRAPHS,
  APP_LANDING_SITE_URL,
  APP_LANDING_SITTER_CTA,
  APP_LANDING_SITTER_EMPHASIS,
  APP_LANDING_SITTER_HEADING,
  APP_LANDING_SITTER_PARAGRAPHS,
  APP_LANDING_SITTER_POINTS
} from "@/lib/marketing/app-landing";
import styles from "./app-landing.module.css";

export function AppLanding({
  parentHref,
  sitterHref
}: {
  parentHref: string;
  sitterHref: string;
}) {
  return (
    <div className={styles.page} dir="rtl">
      <header className={styles.header}>
        <a className={styles.brand} href={APP_LANDING_SITE_URL} aria-label="AnyNanny, לאתר">
          <AnyNannyLogo variant="header" />
        </a>
      </header>

      <main className={styles.main}>
        <h1 className={styles.heroTitle}>{APP_LANDING_H1}</h1>

        <figure className={styles.hero}>
          <img
            src={APP_LANDING_HERO_SRC}
            alt={APP_LANDING_HERO_ALT}
            width={APP_LANDING_HERO_WIDTH}
            height={APP_LANDING_HERO_HEIGHT}
            decoding="async"
            fetchPriority="high"
          />
          <a
            className={`${styles.heroHit} ${styles.heroDownload}`}
            href={APP_LANDING_APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="להורדת AnyNanny ב-App Store"
            data-hero-hit="download"
          />
          <a
            className={`${styles.heroHit} ${styles.heroApple}`}
            href={APP_LANDING_APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="AnyNanny ב-App Store"
            data-hero-hit="app-store"
          />
          <a
            className={`${styles.heroHit} ${styles.heroSite}`}
            href={APP_LANDING_SITE_URL}
            aria-label="AnyNanny.org"
            data-hero-hit="site"
          />
        </figure>

        <div className={styles.audiences}>
          <section className={styles.sitterCard} aria-labelledby="sitter-heading">
            <h2 id="sitter-heading">{APP_LANDING_SITTER_HEADING}</h2>
            {APP_LANDING_SITTER_PARAGRAPHS.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            <ul>
              {APP_LANDING_SITTER_POINTS.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <p className={styles.emphasis}>
              <strong>{APP_LANDING_SITTER_EMPHASIS}</strong>
            </p>
            <a className={styles.sitterCta} href={sitterHref} data-cta="sitter-signup">
              {APP_LANDING_SITTER_CTA}
            </a>
          </section>

          <section className={styles.parentCard} aria-labelledby="parent-heading">
            <h2 id="parent-heading">{APP_LANDING_PARENT_HEADING}</h2>
            {APP_LANDING_PARENT_PARAGRAPHS.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            <ul>
              {APP_LANDING_PARENT_POINTS.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <p>{APP_LANDING_PARENT_NOTE}</p>
            <a className={styles.parentCta} href={parentHref} data-cta="parent-search">
              {APP_LANDING_PARENT_CTA}
            </a>
          </section>
        </div>

        <section className={styles.profile} aria-labelledby="profile-heading">
          <h2 id="profile-heading">{APP_LANDING_PROFILE_HEADING}</h2>
          {APP_LANDING_PROFILE_PARAGRAPHS.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      </main>
    </div>
  );
}
