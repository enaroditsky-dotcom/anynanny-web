"use client";

import {
  MARKETING_PARENT_CHARTER,
  MARKETING_SITTER_CHARTER,
  type MarketingCharterDocument
} from "@/lib/marketing/charters";
import { MARKETING_RESPECT } from "@/lib/marketing/copy";
import { useRef, type MouseEvent } from "react";
import styles from "./marketing-home.module.css";

function CharterBody({ document }: { document: MarketingCharterDocument }) {
  return (
    <>
      {document.blocks.map((block, index) => {
        if (block.type === "p") {
          return <p key={`${document.title}-p-${index}`}>{block.text}</p>;
        }
        if (block.type === "h3" || block.type === "h4") {
          return <h3 key={`${document.title}-h-${index}`}>{block.text}</h3>;
        }
        return (
          <ul key={`${document.title}-ul-${index}`}>
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        );
      })}
    </>
  );
}

export function StoryCharterDialogs() {
  const parentRef = useRef<HTMLDialogElement>(null);
  const sitterRef = useRef<HTMLDialogElement>(null);
  const parentButtonRef = useRef<HTMLButtonElement>(null);
  const sitterButtonRef = useRef<HTMLButtonElement>(null);

  const openDialog = (which: "parent" | "sitter") => {
    const dialog = which === "parent" ? parentRef.current : sitterRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    dialog.scrollTop = 0;
  };

  const onDialogClose = (which: "parent" | "sitter") => {
    const button = which === "parent" ? parentButtonRef.current : sitterButtonRef.current;
    button?.focus({ preventScroll: true });
  };

  const onBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      event.currentTarget.close();
    }
  };

  return (
    <section className={styles.charterLinks} id="charters" aria-label="אמנות הקהילה">
      <p>{MARKETING_RESPECT.charterIntro}</p>
      <div className={styles.charterActions}>
        <button
          ref={parentButtonRef}
          type="button"
          aria-haspopup="dialog"
          aria-controls="parent-charter"
          onClick={() => openDialog("parent")}
        >
          {MARKETING_RESPECT.parentCharterLabel}
        </button>
        <button
          ref={sitterButtonRef}
          type="button"
          aria-haspopup="dialog"
          aria-controls="sitter-charter"
          onClick={() => openDialog("sitter")}
        >
          {MARKETING_RESPECT.sitterCharterLabel}
        </button>
      </div>
      <dialog
        ref={parentRef}
        className={styles.charterDialog}
        id="parent-charter"
        aria-labelledby="parent-charter-title"
        onClose={() => onDialogClose("parent")}
        onClick={onBackdropClick}
      >
        <header className={styles.charterHeader}>
          <h3 id="parent-charter-title" tabIndex={-1}>
            {MARKETING_PARENT_CHARTER.title}
          </h3>
          <form method="dialog">
            <button className={styles.charterClose} aria-label="סגירת אמנת ההורים">
              סגירה ×
            </button>
          </form>
        </header>
        <div className={styles.charterDialogBody}>
          <CharterBody document={MARKETING_PARENT_CHARTER} />
        </div>
      </dialog>
      <dialog
        ref={sitterRef}
        className={styles.charterDialog}
        id="sitter-charter"
        aria-labelledby="sitter-charter-title"
        onClose={() => onDialogClose("sitter")}
        onClick={onBackdropClick}
      >
        <header className={styles.charterHeader}>
          <h3 id="sitter-charter-title" tabIndex={-1}>
            {MARKETING_SITTER_CHARTER.title}
          </h3>
          <form method="dialog">
            <button className={styles.charterClose} aria-label="סגירת אמנת הבייביסיטריות">
              סגירה ×
            </button>
          </form>
        </header>
        <div className={styles.charterDialogBody}>
          <CharterBody document={MARKETING_SITTER_CHARTER} />
        </div>
      </dialog>
    </section>
  );
}
