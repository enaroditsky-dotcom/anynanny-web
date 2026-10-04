import { Clock3, MapPin, ShieldCheck, Wallet } from "lucide-react";
import { Fragment } from "react";
import { AnyNannyLogo } from "@/components/brand/anynanny-logo";
import { STORY_FONT_FILES } from "@/components/marketing/story-rubik";
import {
  STUDENT_CAMPAIGN_HERO_ALT,
  STUDENT_JOBS_BENEFITS,
  STUDENT_JOBS_H1_LINES,
  STUDENT_JOBS_PHONE_CTA,
  STUDENT_JOBS_PRIMARY_CTA,
  STUDENT_JOBS_PROOF,
  STUDENT_JOBS_SIGNUP_NOTE,
  STUDENT_JOBS_SLOGAN,
  STUDENT_JOBS_SUPPORT
} from "@/lib/marketing/student-jobs";
import styles from "./student-jobs-landing.module.css";

const BENEFIT_ICONS = [Clock3, Wallet, MapPin, ShieldCheck] as const;

function BrandName() {
  return (
    <bdi className={styles.brandName}>
      Any<span>Nanny</span>
    </bdi>
  );
}

function withBrand(text: string) {
  const parts = text.split("AnyNanny");
  if (parts.length === 1) return text;
  return parts.map((part, index) => (
    <Fragment key={`${index}-${part}`}>
      {part}
      {index < parts.length - 1 ? <BrandName /> : null}
    </Fragment>
  ));
}

export function StudentJobsLanding({
  signupHref,
  demoHref
}: {
  signupHref: string;
  demoHref: string;
}) {
  return (
    <div className={styles.page} dir="rtl">
      {STORY_FONT_FILES.map((href) => (
        <link key={href} rel="preload" href={href} as="font" type="font/ttf" crossOrigin="anonymous" />
      ))}

      <header className={styles.header}>
        <a href="/" className={styles.headerBrand} aria-label="AnyNanny, לדף הבית">
          <AnyNannyLogo variant="header" decorative />
        </a>
        <p className={styles.slogan}>{STUDENT_JOBS_SLOGAN}</p>
      </header>

      <main className={styles.hero}>
        <div className={styles.heroGrid}>
          <div className={styles.heroMedia}>
            <a
              className={styles.heroVisual}
              href={demoHref}
              data-cta="sitter-demo"
              data-cta-placement="phone"
              data-asset-required="student-campaign-hero"
              aria-label={`${STUDENT_JOBS_PHONE_CTA} — ${STUDENT_CAMPAIGN_HERO_ALT}`}
            >
              <span className={styles.sceneFrame}>
                <span className={styles.sitterScene} role="img" aria-label={STUDENT_CAMPAIGN_HERO_ALT} />
                <span className={styles.phoneCta} aria-hidden="true">
                  <span className={styles.phoneLabel}>{STUDENT_JOBS_PHONE_CTA}</span>
                </span>
              </span>
            </a>
            <p className={styles.proofBadge}>{STUDENT_JOBS_PROOF}</p>
          </div>

          <div className={styles.heroCopy}>
            <h1 id="student-jobs-heading" className={styles.heroTitle}>
              {STUDENT_JOBS_H1_LINES.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h1>

            <p className={styles.support}>{STUDENT_JOBS_SUPPORT}</p>

            <ul className={styles.benefits}>
              {STUDENT_JOBS_BENEFITS.map((benefit, index) => {
                const Icon = BENEFIT_ICONS[index] ?? Clock3;
                return (
                  <li key={benefit.title} className={styles.benefit}>
                    <Icon aria-hidden className={styles.benefitIcon} />
                    <div>
                      <h2>{benefit.title}</h2>
                      <p>{benefit.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>

            <a className={styles.primaryCta} href={signupHref} data-cta="sitter-signup" data-cta-placement="hero">
              {withBrand(STUDENT_JOBS_PRIMARY_CTA)}
            </a>
            <p className={styles.signupNote}>{STUDENT_JOBS_SIGNUP_NOTE}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
