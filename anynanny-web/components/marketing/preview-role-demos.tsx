"use client";

import { useState } from "react";
import styles from "./preview-role-demos.module.css";

const DEMOS = [
  {
    id: "parent",
    title: "הורים",
    src: "/marketing/demo/index.html?role=parent"
  },
  {
    id: "sitter",
    title: "בייביסיטריות",
    src: "/marketing/demo/index.html?role=sitter"
  }
] as const;

export function PreviewRoleDemos() {
  const [active, setActive] = useState<(typeof DEMOS)[number]["id"]>("parent");

  return (
    <div className={styles.wrap}>
      <div className={styles.switch} role="tablist" aria-label="בחירת התנסות">
        {DEMOS.map((demo) => (
          <button
            key={demo.id}
            type="button"
            role="tab"
            id={`preview-tab-${demo.id}`}
            aria-controls={`preview-panel-${demo.id}`}
            aria-selected={active === demo.id}
            className={active === demo.id ? styles.tabActive : styles.tab}
            onClick={() => setActive(demo.id)}
          >
            {demo.title}
          </button>
        ))}
      </div>
      <div className={styles.panels}>
        {DEMOS.map((demo) => (
          <section
            key={demo.id}
            id={`preview-panel-${demo.id}`}
            className={styles.panel}
            role="tabpanel"
            aria-labelledby={`preview-tab-${demo.id}`}
            data-active={active === demo.id ? "true" : "false"}
          >
            <h2 className={styles.title}>{demo.title}</h2>
            <iframe className={styles.frame} src={demo.src} title={`התנסות — ${demo.title}`} />
          </section>
        ))}
      </div>
    </div>
  );
}
