"use client";

import {
  MARKETING_ABOUT,
  MARKETING_COMMUNITY,
  MARKETING_FOUNDER,
  MARKETING_HERO,
  MARKETING_LIFE,
  MARKETING_PARENTS,
  MARKETING_RESPECT,
  MARKETING_SITTERS,
  MARKETING_SLOGAN,
  MARKETING_TOGETHER
} from "@/lib/marketing/copy";
import type { MarketingChapterId } from "@/lib/marketing/chapters";
import { storyLoginHref } from "@/lib/marketing/story-entry";
import { ANYNANNY_SUPPORT_EMAIL } from "@/lib/legal/contact";
import { MarketingHeartButton } from "@/components/marketing/marketing-heart";
import { MarketingHeader, MarketingAccountChoices } from "@/components/marketing/marketing-header";
import { MarketingSidebar } from "@/components/marketing/marketing-sidebar";
import { MarketingMobileActions } from "@/components/marketing/marketing-mobile-actions";
import { StoryAppDemo } from "@/components/marketing/story-app-demo";
import { StoryCharterDialogs } from "@/components/marketing/story-charter-dialogs";
import { StoryOrnament } from "@/components/marketing/story-ornament";
import { STORY_FONT_FILES } from "@/components/marketing/story-rubik";
import { useChapterNavigation } from "@/components/marketing/use-chapter-navigation";
import { Fragment, useCallback, useRef, useState, type CSSProperties, type ReactNode } from "react";
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

function TitleLines({ lines }: { lines: readonly string[] }) {
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={line}>
          {index > 0 ? (
            <>
              <span className={styles.titleBreakSpace}> </span>
              <br className={styles.titleBreak} />
            </>
          ) : null}
          {line}
        </Fragment>
      ))}
    </>
  );
}

function OpeningStory({
  id,
  headingId,
  heading,
  lead,
  paragraphs,
  closing,
  artSrc,
  artAlt,
  actions
}: {
  id: MarketingChapterId;
  headingId: string;
  heading: string;
  lead?: string;
  paragraphs: readonly string[];
  closing: ReactNode;
  artSrc: string;
  artAlt: string;
  artFit?: "cover" | "contain";
  artAnchor?: "family" | "center";
  actions?: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`${styles.storyStage} ${styles.openingChapter}`}
      aria-labelledby={headingId}
    >
      <div className={`${styles.storyScene} ${styles.openingMedia}`} data-story-blend={id}>
        <div className={styles.storyArtWrap}>
          <img className={`${styles.storyArt} ${styles.openingArt}`} src={artSrc} alt={artAlt} />
        </div>
      </div>
      <div className={`${styles.storyCopy} ${styles.openingBody}`}>
        <h2 id={headingId} className={`${styles.storyTitle} ${styles.openingTitle}`} data-chapter-heading>
          {heading}
        </h2>
        <div data-chapter-content>
          {lead ? <p className={styles.openingLead}>{lead}</p> : null}
          <Paragraphs texts={paragraphs} />
          <p className={styles.openingClosing}>{closing}</p>
          {actions}
        </div>
      </div>
    </section>
  );
}

function IllustratedStory({
  id,
  headingId,
  headingLines,
  paragraphs,
  closing,
  artSrc,
  artAlt,
  collage,
  extra
}: {
  id: MarketingChapterId;
  headingId: string;
  headingLines: readonly string[];
  paragraphs: readonly string[];
  closing: ReactNode;
  artSrc: string;
  artAlt: string;
  collage?: boolean;
  extra?: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`${styles.storyStage} ${styles.illustratedChapter} ${collage ? styles.illustratedCollage : ""} ${
        id === "respect" ? styles.respectChapter : ""
      }`}
      aria-labelledby={headingId}
    >
      <div className={`${styles.storyScene} ${styles.illustratedMedia}`} data-story-blend={id}>
        <div className={styles.storyArtWrap}>
          <img
            className={`${styles.storyArt} ${styles.illustratedArt} ${collage ? styles.illustratedArtCollage : ""} ${
              id === "community" ? styles.illustratedArtDoorway : ""
            } ${id === "respect" ? styles.illustratedArtRespect : ""}`}
            src={artSrc}
            alt={artAlt}
          />
        </div>
      </div>
      <article className={`${styles.storyCopy} ${styles.illustratedCopy}`}>
        <h2 id={headingId} className={`${styles.storyTitle} ${styles.illustratedTitle}`} data-chapter-heading>
          <TitleLines lines={headingLines} />
        </h2>
        <div className={styles.illustratedProse} data-chapter-content>
          {paragraphs.map((text) => (
            <p key={text}>{text}</p>
          ))}
          <p className={styles.illustratedClosing}>{closing}</p>
          {extra}
        </div>
      </article>
    </section>
  );
}

export function MarketingHome({
  openAppHref,
  campaignSearch = ""
}: {
  openAppHref: string;
  campaignSearch?: string;
}) {
  const { activeId, goToChapter } = useChapterNavigation();
  const [joinAction, setJoinAction] = useState<"login" | "register" | null>("register");
  const [navOpen, setNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeNav = useCallback(() => setNavOpen(false), []);

  return (
    <div className={styles.page} dir="rtl">
      {STORY_FONT_FILES.map((href) => (
        <link key={href} rel="preload" href={href} as="font" type="font/ttf" crossOrigin="anonymous" />
      ))}
      <MarketingSidebar
        open={navOpen}
        onClose={closeNav}
        activeChapterId={activeId}
        onChapter={(id) => goToChapter(id)}
        campaignSearch={campaignSearch}
      />
      <div className={styles.contentColumn}>
      <aside className={styles.appMoveNotice} data-app-move-notice>
        <div className={styles.appMoveNoticeCopy}>
          <p className={styles.appMoveNoticeTitle}>מחפשים את אפליקציית AnyNanny?</p>
          <p className={styles.appMoveNoticeText}>
            האפליקציה עברה לכתובת חדשה:{" "}
            <strong className={styles.appMoveNoticeDomain} dir="ltr">
              app.anynanny.org
            </strong>
          </p>
        </div>
        <a className={styles.appMoveNoticeButton} href={openAppHref}>
          כניסה לאפליקציה
        </a>
      </aside>
      <MarketingHeader
        navOpen={navOpen}
        onToggleNav={() => setNavOpen((current) => !current)}
        menuButtonRef={menuButtonRef}
        onHome={() => goToChapter("home")}
        loginHref={openAppHref}
      />

      <main className={styles.main}>
        <section id="home" className={styles.heroStage} aria-labelledby="home-heading">
          <div className={styles.heroScene} data-chapter-content>
            <h1 id="home-heading" className={styles.heroHeading} data-chapter-heading>
              AnyNanny
            </h1>
            <p className={styles.heroHeading}>{MARKETING_SLOGAN}</p>
            <div className={styles.heroArtFrame}>
              <img
                className={styles.heroArt}
                src={MARKETING_HERO.artSrc}
                alt={MARKETING_HERO.artAlt}
              />
            </div>
            <a
              href={openAppHref}
              className={styles.heroCtaHotspot}
              aria-label={MARKETING_HERO.appCta}
            >
              <span className={styles.heroHeading}>{MARKETING_HERO.appCta}</span>
            </a>
          </div>
        </section>

        <StoryOrnament />

        <OpeningStory
          id="about"
          headingId="about-heading"
          heading={MARKETING_ABOUT.heading}
          lead={MARKETING_ABOUT.lead}
          paragraphs={MARKETING_ABOUT.paragraphs}
          closing={MARKETING_ABOUT.closing}
          artSrc={MARKETING_ABOUT.artSrc}
          artAlt={MARKETING_ABOUT.artAlt}
          actions={
            <div className={styles.openingActions}>
              <a
                href="#parents"
                className={`${styles.openingCta} ${styles.openingCtaNavy}`}
                onClick={(event) => {
                  event.preventDefault();
                  goToChapter("parents");
                }}
              >
                {MARKETING_ABOUT.parentCta}
              </a>
              <a
                href="#sitters"
                className={`${styles.openingCta} ${styles.openingCtaGreen}`}
                onClick={(event) => {
                  event.preventDefault();
                  goToChapter("sitters");
                }}
              >
                {MARKETING_ABOUT.sitterCta}
              </a>
            </div>
          }
        />

        <StoryOrnament />

        <OpeningStory
          id="founder"
          headingId="founder-heading"
          heading={MARKETING_FOUNDER.heading}
          paragraphs={MARKETING_FOUNDER.paragraphs}
          closing={MARKETING_FOUNDER.closing}
          artSrc={MARKETING_FOUNDER.artSrc}
          artAlt={MARKETING_FOUNDER.artAlt}
          actions={
            <div className={styles.openingActions}>
              <a href={openAppHref} className={`${styles.openingCta} ${styles.openingCtaNavy}`}>
                {MARKETING_FOUNDER.loginCta}
              </a>
            </div>
          }
        />

        <StoryOrnament />

        <OpeningStory
          id="life"
          headingId="life-heading"
          heading={MARKETING_LIFE.heading}
          paragraphs={MARKETING_LIFE.paragraphs}
          closing={
            <>
              {MARKETING_LIFE.closingPrefix}
              <bdi className={styles.openingBrand}>
                Any<span>Nanny</span>
              </bdi>
              {MARKETING_LIFE.closingSuffix}
            </>
          }
          artSrc={MARKETING_LIFE.artSrc}
          artAlt={MARKETING_LIFE.artAlt}
        />

        <StoryOrnament />

        <IllustratedStory
          id="community"
          headingId="community-heading"
          headingLines={MARKETING_COMMUNITY.headingLines}
          paragraphs={MARKETING_COMMUNITY.paragraphs}
          closing={MARKETING_COMMUNITY.closing}
          artSrc={MARKETING_COMMUNITY.artSrc}
          artAlt={MARKETING_COMMUNITY.artAlt}
        />

        <StoryOrnament />

        <IllustratedStory
          id="parents"
          headingId="parents-heading"
          headingLines={MARKETING_PARENTS.headingLines}
          paragraphs={MARKETING_PARENTS.paragraphs}
          closing={
            <>
              {MARKETING_PARENTS.closingLines[0]}
              <br />
              {MARKETING_PARENTS.closingLines[1]}
            </>
          }
          artSrc={MARKETING_PARENTS.artSrc}
          artAlt={MARKETING_PARENTS.artAlt}
          collage
        />

        <StoryOrnament />

        <IllustratedStory
          id="sitters"
          headingId="sitters-heading"
          headingLines={MARKETING_SITTERS.headingLines}
          paragraphs={MARKETING_SITTERS.paragraphs}
          closing={
            <>
              {MARKETING_SITTERS.closingLines[0]}
              <br />
              {MARKETING_SITTERS.closingLines[1]}
            </>
          }
          artSrc={MARKETING_SITTERS.artSrc}
          artAlt={MARKETING_SITTERS.artAlt}
          collage
        />

        <StoryOrnament />

        <StoryAppDemo />

        <StoryOrnament />

        <IllustratedStory
          id="respect"
          headingId="respect-heading"
          headingLines={MARKETING_RESPECT.headingLines}
          paragraphs={MARKETING_RESPECT.paragraphs}
          closing={
            <>
              {MARKETING_RESPECT.closingLines[0]}
              <br />
              {MARKETING_RESPECT.closingLines[1]}
            </>
          }
          artSrc={MARKETING_RESPECT.artSrc}
          artAlt={MARKETING_RESPECT.artAlt}
          collage
          extra={<StoryCharterDialogs />}
        />

        <StoryOrnament />

        <section id="together" className={styles.finaleChapter} aria-labelledby="together-heading">
          <h2 id="together-heading" className={styles.illustratedTitle} data-chapter-heading>
            <TitleLines lines={MARKETING_TOGETHER.headingLines} />
          </h2>
          <section className={styles.finaleGallery} aria-label="רגעים של זמן לחיים">
            {MARKETING_TOGETHER.scenes.map((scene) => (
              <div
                key={scene.alt}
                className={styles.finaleScene}
                role="img"
                aria-label={scene.alt}
                style={{ "--scene-position": scene.position } as CSSProperties}
              />
            ))}
          </section>
          <article className={styles.finaleCopy} data-chapter-content>
            {MARKETING_TOGETHER.paragraphs.map((text) => (
              <p key={text}>{text}</p>
            ))}
            <p className={styles.illustratedClosing}>{MARKETING_TOGETHER.closing}</p>
            <p className={styles.finaleSignature}>
              <bdi className={styles.finaleBrand}>
                Any<span>Nanny</span>
              </bdi>
              <span className={styles.finaleSlogan}>{MARKETING_SLOGAN}</span>
            </p>
            <div className={styles.joinRow}>
              <button
                type="button"
                className={`${styles.joinButton} ${styles.joinPrimary}`}
                onClick={() => setJoinAction("register")}
              >
                {MARKETING_TOGETHER.registerLabel}
              </button>
              <a href={openAppHref} className={`${styles.joinButton} ${styles.joinSecondary}`}>
                {MARKETING_TOGETHER.loginLabel}
              </a>
            </div>
            {joinAction ? (
              <MarketingAccountChoices
                action={joinAction}
                campaignSearch={campaignSearch}
                id="landing-registration-options"
              />
            ) : null}
            <p className={styles.comingSoon}>{MARKETING_TOGETHER.comingSoon}</p>
            <MarketingHeartButton />
          </article>
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
      <MarketingMobileActions
        registerHref={openAppHref}
        loginHref={storyLoginHref(campaignSearch)}
        campaignSearch={campaignSearch}
      />
      </div>
    </div>
  );
}
