"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Briefcase, Coffee, Handshake, Play, ShieldCheck, Sun, Users } from "lucide-react";
import { ANYNANNY_APP_LOGO_SRC } from "@/components/brand/anynanny-app-logo";
import { APP_LANDING_APP_STORE_LABEL, APP_LANDING_APP_STORE_URL } from "@/lib/marketing/app-landing";
import { welcomeTopicPath } from "@/lib/marketing/welcome-topics";
import styles from "./conversion-home.module.css";

const HOME_ART = "/brand/anynanny-home-family-clouds.png";
const ANDROID_WEB_APP_URL = "https://app.anynanny.org";

const CLOUD_LOBES: Array<Array<[number, number, number, number]>> = [
  [
    [72, 76, 58, 34],
    [142, 50, 68, 42],
    [220, 66, 70, 38],
    [168, 90, 104, 28]
  ],
  [
    [58, 80, 48, 30],
    [122, 48, 62, 44],
    [198, 60, 74, 38],
    [258, 82, 44, 26],
    [156, 92, 92, 26]
  ],
  [
    [84, 72, 66, 34],
    [154, 44, 56, 40],
    [226, 64, 68, 40],
    [164, 94, 116, 26]
  ],
  [
    [66, 82, 54, 30],
    [136, 52, 78, 46],
    [214, 58, 58, 38],
    [250, 84, 46, 28],
    [150, 90, 86, 28]
  ]
];

const CLOUDS: Array<{
  key: string;
  href: string;
  label: string;
  className: string;
  icon: LucideIcon;
  shape: number;
}> = [
  { key: "meet", href: welcomeTopicPath("meet"), label: "בואו להכיר את AnyNanny", className: styles.meet, icon: Handshake, shape: 0 },
  { key: "life", href: welcomeTopicPath("life"), label: "פשוט למצוא זמן לחיים", className: styles.life, icon: Sun, shape: 1 },
  { key: "trust", href: welcomeTopicPath("trust"), label: "להכיר ולהיות בטוחים", className: styles.trust, icon: ShieldCheck, shape: 2 },
  { key: "parents", href: "/parents", label: "להורים — קצת זמן לעצמכם", className: styles.parents, icon: Coffee, shape: 3 },
  { key: "sitters", href: welcomeTopicPath("sitters"), label: "לבייביסיטריות — מקום לעבודה הטובה שלכן", className: styles.sitters, icon: Briefcase, shape: 1 },
  { key: "peek", href: welcomeTopicPath("preview"), label: "בואו נציץ פנימה", className: styles.peek, icon: Play, shape: 2 },
  { key: "respect", href: welcomeTopicPath("respect"), label: "כבוד וביטחון מתחילים בהדדיות", className: styles.respect, icon: Users, shape: 0 }
];

function CloudSilhouette({ shape }: { shape: number }) {
  const lobes = CLOUD_LOBES[shape] ?? CLOUD_LOBES[0];
  return (
    <svg className={styles.cloudShape} viewBox="0 0 320 128" preserveAspectRatio="none" aria-hidden="true">
      <g className={styles.cloudShade}>
        {lobes.map(([cx, cy, rx, ry], index) => (
          <ellipse key={`shade-${index}`} cx={cx} cy={cy + 7} rx={rx} ry={ry} />
        ))}
      </g>
      <g className={styles.cloudFill}>
        {lobes.map(([cx, cy, rx, ry], index) => (
          <ellipse key={`fill-${index}`} cx={cx} cy={cy} rx={rx} ry={ry} />
        ))}
      </g>
      <ellipse className={styles.cloudSheen} cx="146" cy="44" rx="70" ry="16" />
    </svg>
  );
}

export function ConversionHome() {
  return (
    <div className={styles.screen}>
      <div className={styles.doodleWash} aria-hidden="true" />
      <main className={styles.main}>
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
            <span className={styles.androidFace}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M17.6 9.48 19.44 6.3c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24c-2.86-1.21-6.08-1.21-8.94 0L5.65 5.67c-.19-.29-.54-.37-.85-.22-.3.16-.42.54-.26.85l1.84 3.18C3.86 11.17 2.5 13.58 2.5 16.2v.3c0 .83.67 1.5 1.5 1.5h16c.83 0 1.5-.67 1.5-1.5v-.3c0-2.62-1.36-5.03-3.9-6.72ZM7 14.5c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1Zm10 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1Z" />
              </svg>
              <span>
                <span className={styles.androidTitle}>להורדה לאנדרואיד</span>
                <span className={styles.androidNote}>דרך האפליקציה בדפדפן</span>
              </span>
            </span>
          </a>
        </div>
        <div className={styles.familyHero} aria-hidden="true">
          <span className={styles.familyShotLeft} />
          <span className={styles.familyShotRight} />
        </div>
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
            {CLOUDS.map((cloud) => {
              const Icon = cloud.icon;
              return (
                <Link key={cloud.key} className={`${styles.cloud} ${cloud.className}`} href={cloud.href}>
                  <span className={styles.cloudTilt}>
                    <span className={styles.cloudRear} aria-hidden="true" />
                    <span className={styles.cloudFront} aria-hidden="true" />
                    <CloudSilhouette shape={cloud.shape} />
                    <span className={styles.cloudBody}>
                      <Icon className={styles.cloudIcon} aria-hidden="true" />
                      <span className={styles.cloudLabel}>{cloud.label}</span>
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
        <div className={styles.familyFooter} aria-hidden="true">
          <span className={styles.familyFootLeft} />
          <span className={styles.familyFootRight} />
        </div>
      </main>
    </div>
  );
}
