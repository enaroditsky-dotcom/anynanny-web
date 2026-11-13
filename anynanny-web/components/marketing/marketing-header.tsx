"use client";

import type { RefObject } from "react";
import { Menu } from "lucide-react";
import { MARKETING_TOGETHER } from "@/lib/marketing/copy";
import { storyChapterHref } from "@/lib/marketing/chapters";
import { MARKETING_SITE_NAV_ID } from "@/lib/marketing/site-nav";
import { storyAccountHref, type StoryAccountAction } from "@/lib/marketing/story-entry";
import { AnyNannyLogo } from "@/components/brand/anynanny-logo";
import styles from "./marketing-home.module.css";

export function MarketingAccountChoices({
  action,
  campaignSearch = "",
  id
}: {
  action: StoryAccountAction;
  campaignSearch?: string;
  id?: string;
}) {
  return (
    <div className={styles.roleChoices} id={id}>
      <a href={storyAccountHref(action, "parent", campaignSearch)} data-press="">הורים</a>
      <a href={storyAccountHref(action, "sitter", campaignSearch)} data-press="">בייביסיטר</a>
    </div>
  );
}

export function MarketingHeader({
  navOpen,
  onToggleNav,
  menuButtonRef,
  onHome,
  homeHref = storyChapterHref("home"),
  loginHref,
  headerClassName
}: {
  navOpen: boolean;
  onToggleNav: () => void;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  onHome: () => void;
  homeHref?: string;
  loginHref: string;
  headerClassName?: string;
}) {
  return (
    <header className={headerClassName ? `${styles.header} ${headerClassName}` : styles.header} data-marketing-header>
      <div className={styles.headerInner}>
        <a
          href={homeHref}
          className={styles.headerBrand}
          onClick={(event) => {
            event.preventDefault();
            onHome();
          }}
        >
          <AnyNannyLogo variant="header" />
        </a>

        <div className={styles.headerActions}>
          <a href={loginHref} className={styles.accountButton}>
            {MARKETING_TOGETHER.loginLabel}
          </a>
          <button
            ref={menuButtonRef}
            type="button"
            className={styles.menuButton}
            aria-label="תפריט האתר"
            aria-expanded={navOpen}
            aria-controls={MARKETING_SITE_NAV_ID}
            onClick={onToggleNav}
          >
            <Menu aria-hidden className={styles.menuButtonIcon} />
            <span>תפריט</span>
          </button>
        </div>
      </div>
      <p className={styles.headerSlogan}>
        <span className={styles.headerSloganMotion}>
          <span className={styles.headerSloganText}>פשוט למצוא זמן לחיים!</span>
        </span>
      </p>
    </header>
  );
}
