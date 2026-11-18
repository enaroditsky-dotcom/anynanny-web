"use client";

import { MARKETING_APP } from "@/lib/marketing/copy";
import { useEffect, useState } from "react";
import styles from "./marketing-home.module.css";

export function StoryAppDemo() {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.source !== "anynanny-demo") return;
      setExpanded(Boolean(event.data.open));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <section id="app" className={styles.demoChapter} aria-labelledby="app-heading">
      <h2 id="app-heading" className={styles.srOnly} data-chapter-heading>
        {MARKETING_APP.heading}
      </h2>
      <iframe
        className={expanded ? styles.demoFrameExpanded : styles.demoFrame}
        src={MARKETING_APP.demoSrc}
        title={MARKETING_APP.heading}
        data-chapter-content
      />
    </section>
  );
}
