import { LogIn, UserPlus } from "lucide-react";
import { COMING_SOON_LABEL } from "@/lib/marketing/site-nav";
import styles from "./marketing-home.module.css";

function AppleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M16.365 12.84c.03 3.23 2.83 4.31 2.86 4.32-.02.08-.445 1.52-1.47 3.01-.88 1.28-1.8 2.56-3.24 2.59-1.42.03-1.88-.84-3.5-.84-1.63 0-2.13.82-3.48.87-1.39.05-2.45-1.39-3.34-2.67C2.3 17.4.91 12.57 2.79 9.31c.93-1.62 2.59-2.65 4.39-2.68 1.37-.03 2.66.92 3.5.92.84 0 2.41-1.14 4.06-.97.69.03 2.63.28 3.88 2.11-.1.06-2.32 1.35-2.29 4.15zm-2.15-6.32c.74-.9 1.24-2.14 1.1-3.38-1.07.04-2.36.71-3.12 1.61-.68.79-1.28 2.05-1.12 3.26 1.18.09 2.39-.6 3.14-1.49z" />
    </svg>
  );
}

function GooglePlayMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M3.18 2.67c-.24.13-.4.38-.4.65v17.36c0 .27.16.52.4.65l10.05-9.33z" />
      <path fill="#34A853" d="m13.23 12 3.52 3.52 4.48-2.55c.77-.44.77-1.58 0-2.02l-4.48-2.55z" />
      <path fill="#FBBC04" d="M13.23 12 3.18 21.33c.24.14.54.16.8.02L16.75 15.52z" />
      <path fill="#EA4335" d="M16.75 8.48 3.98 2.65c-.26-.14-.56-.12-.8.02L13.23 12z" />
    </svg>
  );
}

function StoreAction({
  store,
  label
}: {
  store: "play" | "apple";
  label: string;
}) {
  return (
    <button
      type="button"
      className={styles.mobileStoreAction}
      disabled
      aria-label={`${label} להורדה, ${COMING_SOON_LABEL}`}
    >
      {store === "play" ? (
        <GooglePlayMark className={styles.mobileStoreMark} />
      ) : (
        <AppleMark className={styles.mobileStoreMark} />
      )}
      <span className={styles.mobileStoreLabel}>{label}</span>
    </button>
  );
}

export function MarketingMobileActions({
  registerHref,
  loginHref
}: {
  registerHref: string;
  loginHref: string;
}) {
  return (
    <nav className={styles.mobileActionBar} aria-label="הורדה, הרשמה והתחברות" dir="rtl">
      <StoreAction store="play" label="Android" />
      <StoreAction store="apple" label="iPhone" />
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
