import { LogIn, UserPlus } from "lucide-react";
import {
  MARKETING_APP_STORE_BADGE_ALT,
  MARKETING_PLAY_BADGE_ALT
} from "@/components/marketing/marketing-store-badges";
import { GOOGLE_PLAY_LISTING_URL, IPHONE_APP_STORE_URL, withStoreCampaign } from "@/lib/marketing/site-nav";
import styles from "./marketing-home.module.css";

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
  const playHref = withStoreCampaign(GOOGLE_PLAY_LISTING_URL, campaignSearch);

  return (
    <nav className={styles.mobileActionBar} aria-label="הורדה, הרשמה והתחברות" dir="rtl">
      <a
        className={styles.mobileStoreBadge}
        href={appStoreHref}
        target="_blank"
        rel="noopener noreferrer"
        data-cta="app-store"
      >
        <img src="/brand/app-store-badge-he.svg" alt={MARKETING_APP_STORE_BADGE_ALT} width={122} height={42} />
      </a>
      <a
        className={styles.mobileStoreBadge}
        href={playHref}
        target="_blank"
        rel="noopener noreferrer"
        data-cta="google-play"
      >
        <img src="/brand/google-play-badge-en.png" alt={MARKETING_PLAY_BADGE_ALT} width={646} height={250} />
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
