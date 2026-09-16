"use client";

import { AnyNannyLogo } from "@/components/brand/anynanny-logo";
import { AnynannyMascotPortrait } from "@/components/brand/anynanny-mascot-portrait";
import { HomepageWelcomeVideo } from "@/components/welcome/homepage-welcome-video";
import { APP_GALLERY_SHOTS, MARKETING_SHOTS } from "@/lib/marketing/assets";
import {
  MARKETING_ABOUT,
  MARKETING_APP,
  MARKETING_COMMUNITY,
  MARKETING_FOUNDER,
  MARKETING_HOME_PARAGRAPHS,
  MARKETING_PARENTS,
  MARKETING_PROFILE,
  MARKETING_RESPECT,
  MARKETING_SITTERS,
  MARKETING_SLOGAN,
  MARKETING_TOGETHER
} from "@/lib/marketing/copy";
import { MARKETING_PARENT_CHARTER, MARKETING_SITTER_CHARTER } from "@/lib/marketing/charters";
import { ANYNANNY_SUPPORT_EMAIL } from "@/lib/legal/contact";
import { MarketingAnalytics } from "@/components/marketing/marketing-analytics";
import { MarketingCharter } from "@/components/marketing/marketing-charter";
import { MarketingHeartButton } from "@/components/marketing/marketing-heart";
import {
  MarketingHeader,
  MarketingAccountChoices,
  type NavigateWithPath
} from "@/components/marketing/marketing-header";
import { MarketingSidebar } from "@/components/marketing/marketing-sidebar";
import {
  MarketingScreenshot,
  MarketingScreenshotGallery,
  MarketingScreenshotPair
} from "@/components/marketing/marketing-screenshot";
import { useChapterNavigation } from "@/components/marketing/use-chapter-navigation";
import { useCallback, useRef, useState } from "react";
import styles from "./marketing-home.module.css";

function Paragraphs({ texts }: { texts: readonly string[] }) {
  return (
    <>
      {texts.map((text) => (
        <p key={text} className={styles.body}>
          {text}
        </p>
      ))}
    </>
  );
}

export function MarketingHome({ onNavigate }: { onNavigate: NavigateWithPath }) {
  const { activeId, goToChapter } = useChapterNavigation();
  const [joinAction, setJoinAction] = useState<"login" | "register" | null>("register");
  const [navOpen, setNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeNav = useCallback(() => setNavOpen(false), []);

  return (
    <div className={styles.page} dir="rtl">
      <MarketingAnalytics />
      <MarketingSidebar
        open={navOpen}
        onClose={closeNav}
        activeChapterId={activeId}
        onChapter={(id) => goToChapter(id)}
      />
      <div className={styles.contentColumn}>
      <MarketingHeader
        navOpen={navOpen}
        onToggleNav={() => setNavOpen((current) => !current)}
        menuButtonRef={menuButtonRef}
        onHome={() => goToChapter("home")}
      />

      <main className={styles.main}>
        <section id="home" className={`${styles.chapter} ${styles.hero}`} aria-labelledby="home-heading">
          <div className={`${styles.chapterInner} ${styles.heroInner}`} data-chapter-content>
            <h1 id="home-heading" data-chapter-heading>
              <AnyNannyLogo variant="hero" />
            </h1>
            <p className={styles.slogan}>{MARKETING_SLOGAN}</p>
            {MARKETING_HOME_PARAGRAPHS.map((text) => (
              <p key={text} className={styles.lede}>
                {text}
              </p>
            ))}
            <p className={styles.invite}>
              <a
                href="#about"
                onClick={(event) => {
                  event.preventDefault();
                  goToChapter("about");
                }}
              >
                {MARKETING_ABOUT.heading}
              </a>
            </p>
          </div>
        </section>

        <section id="about" className={`${styles.chapter} ${styles.chapterAlt}`} aria-labelledby="about-heading">
          <div className={styles.chapterInner} data-chapter-content>
            <h2 id="about-heading" className={styles.heading} data-chapter-heading>
              {MARKETING_ABOUT.heading}
            </h2>
            <Paragraphs texts={MARKETING_ABOUT.paragraphs} />
            <div className={styles.videoSlot}>
              <HomepageWelcomeVideo
                onJoinClick={() => {
                  setJoinAction("register");
                  goToChapter("together");
                }}
              />
            </div>
          </div>
        </section>

        <section id="founder" className={styles.chapter} aria-labelledby="founder-heading">
          <div className={styles.chapterInner} data-chapter-content>
            <h2 id="founder-heading" className={styles.heading} data-chapter-heading>
              {MARKETING_FOUNDER.heading}
            </h2>
            <Paragraphs texts={MARKETING_FOUNDER.paragraphs} />
          </div>
        </section>

        <section id="community" className={`${styles.chapter} ${styles.chapterAlt}`} aria-labelledby="community-heading">
          <div className={styles.chapterInner} data-chapter-content>
            <h2 id="community-heading" className={styles.heading} data-chapter-heading>
              {MARKETING_COMMUNITY.heading}
            </h2>
            <Paragraphs texts={MARKETING_COMMUNITY.paragraphs} />
            <div className={styles.mascotWrap}>
              <AnynannyMascotPortrait
                framed={false}
                className="h-28 w-28 bg-[#f7f2ea] sm:h-36 sm:w-36"
              />
            </div>
          </div>
        </section>

        <section id="parents" className={styles.chapter} aria-labelledby="parents-heading">
          <div className={styles.chapterInner} data-chapter-content>
            <h2 id="parents-heading" className={styles.heading} data-chapter-heading>
              {MARKETING_PARENTS.heading}
            </h2>
            <Paragraphs texts={MARKETING_PARENTS.paragraphs.slice(0, 4)} />
          </div>
          <div className={styles.chapterMedia}>
            <MarketingScreenshotPair shots={[MARKETING_SHOTS.nowResults, MARKETING_SHOTS.nowCall]} />
          </div>
          <div className={styles.chapterInner}>
            <Paragraphs texts={MARKETING_PARENTS.paragraphs.slice(4)} />
          </div>
        </section>

        <section id="sitters" className={`${styles.chapter} ${styles.chapterAlt}`} aria-labelledby="sitters-heading">
          <div className={styles.chapterInner} data-chapter-content>
            <h2 id="sitters-heading" className={styles.heading} data-chapter-heading>
              {MARKETING_SITTERS.heading}
            </h2>
            <Paragraphs texts={MARKETING_SITTERS.paragraphs.slice(0, 3)} />
          </div>
          <div className={styles.chapterMedia}>
            <div className={styles.singleShot}>
              <MarketingScreenshot shot={MARKETING_SHOTS.calendar} />
            </div>
          </div>
          <div className={styles.chapterInner}>
            <Paragraphs texts={MARKETING_SITTERS.paragraphs.slice(3)} />
          </div>
        </section>

        <section id="app" className={styles.chapter} aria-labelledby="app-heading">
          <div className={styles.chapterInner} data-chapter-content>
            <h2 id="app-heading" className={styles.heading} data-chapter-heading>
              {MARKETING_APP.heading}
            </h2>
            <Paragraphs texts={MARKETING_APP.paragraphs.slice(0, 5)} />
          </div>
          <div className={styles.chapterMedia}>
            <MarketingScreenshotPair shots={[MARKETING_SHOTS.wallet, MARKETING_SHOTS.history]} />
            <div className={styles.galleryBlock}>
              <MarketingScreenshotGallery shots={APP_GALLERY_SHOTS} />
            </div>
          </div>
          <div className={styles.chapterInner}>
            <Paragraphs texts={MARKETING_APP.paragraphs.slice(5)} />
          </div>
        </section>

        <section id="respect" className={`${styles.chapter} ${styles.chapterAlt}`} aria-labelledby="respect-heading">
          <div className={styles.chapterInner} data-chapter-content>
            <h2 id="respect-heading" className={styles.heading} data-chapter-heading>
              {MARKETING_RESPECT.heading}
            </h2>
            <Paragraphs texts={MARKETING_RESPECT.lead} />
          </div>
          <div className={styles.chapterMedia}>
            <MarketingScreenshotPair shots={[MARKETING_SHOTS.report, MARKETING_SHOTS.familyRating]} />
          </div>
          <div className={styles.chapterInner} id="charters">
            <MarketingCharter document={MARKETING_PARENT_CHARTER} />
            <MarketingCharter document={MARKETING_SITTER_CHARTER} />
            <Paragraphs texts={MARKETING_RESPECT.closing} />
          </div>
        </section>

        <section id="profile" className={styles.chapter} aria-labelledby="profile-heading">
          <div className={styles.chapterInner} data-chapter-content>
            <h2 id="profile-heading" className={styles.heading} data-chapter-heading>
              {MARKETING_PROFILE.heading}
            </h2>
            <Paragraphs texts={MARKETING_PROFILE.paragraphs} />
          </div>
        </section>

        <section id="together" className={`${styles.chapter} ${styles.chapterAlt}`} aria-labelledby="together-heading">
          <div className={styles.chapterInner} data-chapter-content>
            <h2 id="together-heading" className={styles.heading} data-chapter-heading>
              {MARKETING_TOGETHER.heading}
            </h2>
            <Paragraphs texts={MARKETING_TOGETHER.paragraphs} />
            <p className={styles.signature}>{MARKETING_TOGETHER.signature}</p>
            <p className={styles.closingBrand}>{MARKETING_TOGETHER.closingLine}</p>
            <div className={styles.joinRow}>
              <button
                type="button"
                className={`${styles.joinButton} ${styles.joinPrimary}`}
                onClick={() => setJoinAction("register")}
              >
                {MARKETING_TOGETHER.registerLabel}
              </button>
              <a href="/login" className={`${styles.joinButton} ${styles.joinSecondary}`}>
                {MARKETING_TOGETHER.loginLabel}
              </a>
            </div>
            {joinAction ? (
              <MarketingAccountChoices
                action={joinAction}
                onNavigate={onNavigate}
                id="landing-registration-options"
              />
            ) : null}
            <p className={styles.comingSoon}>{MARKETING_TOGETHER.comingSoon}</p>
            <MarketingHeartButton />
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <a href="/privacy">מדיניות פרטיות</a>
          <a href="/terms">תנאי שימוש</a>
          <a href="/delete-account">מחיקת חשבון</a>
          <a href="#charters">אמנות הקהילה</a>
          <a href={`mailto:${ANYNANNY_SUPPORT_EMAIL}`}>{ANYNANNY_SUPPORT_EMAIL}</a>
        </div>
      </footer>
      </div>
    </div>
  );
}
