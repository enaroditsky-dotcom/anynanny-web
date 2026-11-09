"use client";

import type { RefObject } from "react";
import { Menu } from "lucide-react";
import { MARKETING_TOGETHER } from "@/lib/marketing/copy";
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
      <a href={storyAccountHref(action, "parent", campaignSearch)}>הורים</a>
      <a href={storyAccountHref(action, "sitter", campaignSearch)}>בייביסיטר</a>
    </div>
  );
}

export function MarketingHeader({
  navOpen,
  onToggleNav,
  menuButtonRef,
  onHome,
  loginHref
}: {
  navOpen: boolean;
  onToggleNav: () => void;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  onHome: () => void;
  loginHref: string;
}) {
  return (
    <header className={styles.header} data-marketing-header>
      <div className={styles.headerInner}>
        <a
          href="#home"
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
    </header>
  );
}
