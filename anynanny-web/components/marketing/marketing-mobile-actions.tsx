import { Globe, LogIn, UserPlus } from "lucide-react";
import { generalWebAppHref } from "@/lib/marketing/general-acquisition";
import { IPHONE_APP_STORE_URL, withStoreCampaign } from "@/lib/marketing/site-nav";
import styles from "./marketing-home.module.css";

function AppleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M16.365 12.84c.03 3.23 2.83 4.31 2.86 4.32-.02.08-.445 1.52-1.47 3.01-.88 1.28-1.8 2.56-3.24 2.59-1.42.03-1.88-.84-3.5-.84-1.63 0-2.13.82-3.48.87-1.39.05-2.45-1.39-3.34-2.67C2.3 17.4.91 12.57 2.79 9.31c.93-1.62 2.59-2.65 4.39-2.68 1.37-.03 2.66.92 3.5.92.84 0 2.41-1.14 4.06-.97.69.03 2.63.28 3.88 2.11-.1.06-2.32 1.35-2.29 4.15zm-2.15-6.32c.74-.9 1.24-2.14 1.1-3.38-1.07.04-2.36.71-3.12 1.61-.68.79-1.28 2.05-1.12 3.26 1.18.09 2.39-.6 3.14-1.49z" />
    </svg>
  );
}

export function MarketingMobileActions({
  registerHref,
  loginHref,
  campaignSearch = ""
}: {
  registerHref: string;
  loginHref: string;
  campaignSearch?: string;
}) {
  const appStoreHref = withStoreCampaign(IPHONE_APP_STORE_URL, campaignSearch);
  const webAppHref = generalWebAppHref(campaignSearch);

  return (
    <nav className={styles.mobileActionBar} aria-label="הורדה, הרשמה והתחברות" dir="rtl">
      <a
        className={styles.mobileStoreAction}
        href={webAppHref}
        aria-label="Web App לאנדרואיד"
        data-cta="web-app"
      >
        <Globe aria-hidden className={styles.mobileStoreMark} strokeWidth={2} />
        <span className={styles.mobileStoreLabel}>Web App</span>
      </a>
      <a
        className={styles.mobileStoreAction}
        href={appStoreHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="להורדה ב־App Store"
        data-cta="app-store"
      >
        <AppleMark className={styles.mobileStoreMark} />
        <span className={styles.mobileStoreLabel}>App Store</span>
      </a>
      <a href={registerHref} className={`${styles.mobileAccountAction} ${styles.mobileRegister}`}>
        <UserPlus aria-hidden className={styles.mobileAccountIcon} />
        <span>הרשמה</span>
      </a>
      <a href={loginHref} className={`${styles.mobileAccountAction} ${styles.mobileLogin}`}>
        <LogIn aria-hidden className={styles.mobileAccountIcon} />
        <span>התחברות</span>
      </a>
    </nav>
  );
}
