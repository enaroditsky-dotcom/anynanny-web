import Link from "next/link";
import { MarketingHomeReturn } from "@/components/marketing/marketing-home-return";
import { PreviewRoleDemos } from "@/components/marketing/preview-role-demos";
import type { WelcomeTopic } from "@/lib/marketing/welcome-topics";
import styles from "./welcome-topic-page.module.css";

export function WelcomeTopicPage({ topic }: { topic: WelcomeTopic }) {
  const heading = (
    <h1>
      {(topic.headingLines ?? [topic.heading]).map((line) => (
        <span key={line} className={styles.line}>
          {line}
        </span>
      ))}
    </h1>
  );
  const lead = topic.lead ? <p className={styles.lead}>{topic.lead}</p> : null;
  const paragraphs = topic.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>);
  const closing = topic.closingLines ? (
    <p className={styles.closing}>
      {topic.closingLines.map((line) => (
        <span key={line} className={styles.line}>
          {line}
        </span>
      ))}
    </p>
  ) : topic.closing ? (
    <p className={styles.closing}>{topic.closing}</p>
  ) : null;

  return (
    <article
      className={`${styles.page} ${topic.slug === "sitters" ? styles.pageSitters : ""} ${topic.demo ? styles.pagePreview : ""}`}
      dir="rtl"
    >
      <MarketingHomeReturn />
      {topic.slug === "sitters" && topic.artSrc ? (
        <div className={styles.sitters}>
          <div className={styles.sittersCopy}>
            {heading}
            <div className={styles.copy}>
              {lead}
              {paragraphs}
              {closing}
            </div>
          </div>
          <img className={styles.sittersArt} src={topic.artSrc} alt={topic.artAlt ?? ""} />
        </div>
      ) : (
        <>
          {heading}
          {lead}
          {topic.artSrc ? <img className={styles.art} src={topic.artSrc} alt={topic.artAlt ?? ""} /> : null}
          {paragraphs}
          {closing}
        </>
      )}
      {topic.demo ? <PreviewRoleDemos /> : null}
      <p className={styles.more}>
        <Link href="/story">לסיפור המלא של AnyNanny</Link>
      </p>
    </article>
  );
}
