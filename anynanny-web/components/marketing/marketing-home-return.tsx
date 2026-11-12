import Link from "next/link";
import styles from "./marketing-home-return.module.css";

export function MarketingHomeReturn() {
  return (
    <p className={styles.wrap}>
      <Link href="/" className={styles.link} data-press="">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 10.5 12 4l8 6.5" />
          <path d="M6 9.8V20h12V9.8" />
        </svg>
        <span>חזרה לדף הבית</span>
      </Link>
    </p>
  );
}
