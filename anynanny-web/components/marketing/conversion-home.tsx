"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Briefcase, Coffee, Handshake, Play, ShieldCheck, Sun, Users } from "lucide-react";
import { ANYNANNY_APP_LOGO_SRC } from "@/components/brand/anynanny-app-logo";
import { MarketingCopyright } from "@/components/marketing/marketing-copyright";
import { appLandingSignupHref } from "@/lib/marketing/app-landing";
import { generalWebAppHref } from "@/lib/marketing/general-acquisition";
import { MARKETING_HOME_H1, MARKETING_HOME_SUPPORT } from "@/lib/marketing/marketing-home";
import { welcomeTopicPath } from "@/lib/marketing/welcome-topics";
import styles from "./conversion-home.module.css";

const HOME_ART = "/brand/anynanny-home-family-clouds.png?v=3";

const CLOUD_LOBES: Array<Array<[number, number, number, number]>> = [
  [
    [78, 74, 64, 36],
    [160, 48, 82, 42],
    [244, 72, 66, 36],
    [160, 94, 132, 30]
  ],
  [
    [62, 78, 52, 32],
    [128, 50, 66, 40],
    [208, 46, 72, 40],
    [270, 76, 46, 30],
    [160, 96, 126, 28]
  ],
  [
    [88, 74, 70, 36],
    [168, 46, 76, 42],
    [248, 70, 62, 36],
    [160, 96, 134, 28]
  ],
  [
    [70, 78, 56, 34],
    [148, 48, 80, 44],
    [228, 64, 66, 38],
    [272, 84, 42, 26],
    [158, 98, 122, 26]
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
          <ellipse key={`shade-${index}`} cx={cx} cy={cy + 5} rx={rx} ry={ry} />
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

export function ConversionHome({ campaignSearch = "" }: { campaignSearch?: string }) {
  const parentHref = generalWebAppHref(campaignSearch);
  const sitterHref = appLandingSignupHref("sitter", campaignSearch);
  return (
    <div className={styles.screen}>
      <div className={styles.doodleWash} aria-hidden="true" />
      <main className={styles.main}>
        <div className={styles.entry}>
          <a className={styles.parentEntry} href={parentHref} data-cta="parent-search" data-press="">
            לחיפוש בייביסיטר
          </a>
          <a className={styles.sitterEntry} href={sitterHref} data-cta="sitter-signup" data-press="">
            להרשמה כבייביסיטרית
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
          <p className={styles.homeSlogan}>
            <span className={styles.homeSloganMotion}>פשוט למצוא זמן לחיים!</span>
          </p>
        </div>
        <div className={styles.stage}>
          <div className={styles.art}>
            <img className={styles.artImage} src={HOME_ART} alt="" />
            <h1 className={styles.welcomeTitle}>{MARKETING_HOME_H1}</h1>
            <p className={styles.welcomePrompt}>{MARKETING_HOME_SUPPORT}</p>
            <div className={styles.cloudField}>
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
        </div>
        <div className={styles.familyFooter} aria-hidden="true">
          <span className={styles.familyFootLeft} />
          <span className={styles.familyFootRight} />
        </div>
        <MarketingCopyright className={styles.copyright} />
      </main>
    </div>
  );
}
