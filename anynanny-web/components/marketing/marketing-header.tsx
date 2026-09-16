"use client";

import type { RefObject } from "react";
import { Menu } from "lucide-react";
import { MARKETING_TOGETHER } from "@/lib/marketing/copy";
import { MARKETING_SITE_NAV_ID } from "@/lib/marketing/site-nav";
import { AnyNannyLogo } from "@/components/brand/anynanny-logo";
import styles from "./marketing-home.module.css";

export type MarketingPath = "parent" | "sitter";
export type NavigateWithPath = (action: "login" | "register", path: MarketingPath) => void;

export function MarketingAccountChoices({
  action,
  onNavigate,
  id
}: {
  action: "login" | "register";
  onNavigate: NavigateWithPath;
  id?: string;
}) {
  return (
    <div className={styles.roleChoices} id={id}>
      <button type="button" onClick={() => onNavigate(action, "parent")}>
        הורים
      </button>
      <button type="button" onClick={() => onNavigate(action, "sitter")}>
        בייביסיטר
      </button>
    </div>
  );
}

export function MarketingHeader({
  navOpen,
  onToggleNav,
  menuButtonRef,
  onHome
}: {
  navOpen: boolean;
  onToggleNav: () => void;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  onHome: () => void;
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
          <a href="/login" className={styles.accountButton}>
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
