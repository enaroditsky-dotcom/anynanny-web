"use client";

import Link from "next/link";
import { ANYNANNY_APP_LOGO_SRC } from "@/components/brand/anynanny-app-logo";
import { APP_LANDING_APP_STORE_LABEL, APP_LANDING_APP_STORE_URL } from "@/lib/marketing/app-landing";
import { welcomeTopicPath } from "@/lib/marketing/welcome-topics";
import styles from "./conversion-home.module.css";

const HOME_ART = "/brand/anynanny-home-family-clouds.png";
const ANDROID_WEB_APP_URL = "https://app.anynanny.org";

const CLOUDS = [
  { key: "meet", href: welcomeTopicPath("meet"), label: "בואו להכיר את AnyNanny", className: styles.meet },
  { key: "life", href: welcomeTopicPath("life"), label: "פשוט למצוא זמן לחיים", className: styles.life },
  { key: "trust", href: welcomeTopicPath("trust"), label: "להכיר ולהיות בטוחים", className: styles.trust },
  { key: "parents", href: "/parents", label: "להורים — קצת זמן לעצמכם", className: styles.parents },
  { key: "sitters", href: welcomeTopicPath("sitters"), label: "לבייביסיטריות — מקום לעבודה הטובה שלכן", className: styles.sitters },
  { key: "peek", href: welcomeTopicPath("preview"), label: "בואו נציץ פנימה", className: styles.peek },
  { key: "respect", href: welcomeTopicPath("respect"), label: "כבוד וביטחון מתחילים בהדדיות", className: styles.respect }
] as const;

export function ConversionHome() {
  return (
    <div className={styles.screen}>
      <main className={styles.main}>
        <div className={styles.logo}>
          <img
            className={styles.logoImage}
            src={ANYNANNY_APP_LOGO_SRC}
            alt=""
            width={2172}
            height={724}
            decoding="async"
            draggable={false}
          />
        </div>
        <div className={styles.stage}>
          <div className={styles.art}>
            <img className={styles.artImage} src={HOME_ART} alt="" />
            <h1 className={styles.welcomeTitle}>ברוכים הבאים ל־AnyNanny!</h1>
            <p className={styles.welcomePrompt}>נעים להכיר. מה מביא אתכם לכאן?</p>
            {CLOUDS.map((cloud) => (
              <Link key={cloud.key} className={`${styles.cloud} ${cloud.className}`} href={cloud.href}>
                <span className={styles.cloudRear} aria-hidden="true" />
                <span className={styles.cloudFront} aria-hidden="true" />
                <span className={styles.cloudLabel}>{cloud.label}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className={styles.downloads}>
          <a
            className={styles.storeLink}
            href={APP_LANDING_APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={APP_LANDING_APP_STORE_LABEL}
            data-press=""
          >
            <img src="/brand/app-store-badge-he.svg" alt="" width={122} height={42} />
          </a>
          <a className={styles.androidLink} href={ANDROID_WEB_APP_URL} data-press="">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17.6 9.48 19.44 6.3c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24c-2.86-1.21-6.08-1.21-8.94 0L5.65 5.67c-.19-.29-.54-.37-.85-.22-.3.16-.42.54-.26.85l1.84 3.18C3.86 11.17 2.5 13.58 2.5 16.2v.3c0 .83.67 1.5 1.5 1.5h16c.83 0 1.5-.67 1.5-1.5v-.3c0-2.62-1.36-5.03-3.9-6.72ZM7 14.5c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1Zm10 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1Z" />
            </svg>
            <span>
              <span className={styles.androidTitle}>להורדה לאנדרואיד</span>
              <span className={styles.androidNote}>דרך האפליקציה בדפדפן</span>
            </span>
          </a>
        </div>
      </main>
    </div>
  );
}
