import {
  GENERAL_ACQUISITION_ANNY_ALT,
  GENERAL_ACQUISITION_ANNY_SIZE,
  GENERAL_ACQUISITION_ANNY_SRC,
  GENERAL_ACQUISITION_DIRECT,
  GENERAL_ACQUISITION_H1,
  GENERAL_ACQUISITION_WORDMARK_ALT,
  GENERAL_ACQUISITION_WORDMARK_HEIGHT,
  GENERAL_ACQUISITION_WORDMARK_SRC,
  GENERAL_ACQUISITION_WORDMARK_WIDTH,
  SITE_URL
} from "@/lib/marketing/general-acquisition";
import {
  MARKETING_HOME_LINKS,
  MARKETING_HOME_OPEN_APP_LABEL
} from "@/lib/marketing/marketing-home";
import styles from "./marketing-home-page.module.css";

export function MarketingHomePage({ openAppHref }: { openAppHref: string }) {
  return (
    <main className={styles.page} dir="rtl">
      <a className={styles.lockup} href={SITE_URL} aria-label={GENERAL_ACQUISITION_WORDMARK_ALT}>
        <img
          className={styles.anny}
          src={GENERAL_ACQUISITION_ANNY_SRC}
          alt={GENERAL_ACQUISITION_ANNY_ALT}
          width={GENERAL_ACQUISITION_ANNY_SIZE}
          height={GENERAL_ACQUISITION_ANNY_SIZE}
        />
        <img
          className={styles.wordmark}
          src={GENERAL_ACQUISITION_WORDMARK_SRC}
          alt=""
          width={GENERAL_ACQUISITION_WORDMARK_WIDTH}
          height={GENERAL_ACQUISITION_WORDMARK_HEIGHT}
        />
      </a>
      <h1 className={styles.headline}>{GENERAL_ACQUISITION_H1}</h1>
      <p className={styles.direct}>{GENERAL_ACQUISITION_DIRECT}</p>
      <ul className={styles.paths}>
        {MARKETING_HOME_LINKS.map((link) => (
          <li key={link.href}>
            <a className={styles.path} href={link.href}>
              {link.label}
            </a>
          </li>
        ))}
      </ul>
      <a className={styles.openApp} href={openAppHref} data-cta="open-app">
        {MARKETING_HOME_OPEN_APP_LABEL}
      </a>
    </main>
  );
}
