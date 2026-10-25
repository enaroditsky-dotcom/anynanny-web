"use client";

import Link from "next/link";
import { Megaphone, X } from "lucide-react";
import { dismissUnansweredQuestionCard } from "@/lib/broadcast/use-unanswered-questions";
import { MY_QUESTIONS_HREF, broadcastQuestionHref } from "@/lib/broadcast/question-link";

const ICON_BUTTON =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-current/70 transition hover:bg-white/70 hover:text-current";

export function UnansweredQuestionCard({
  card,
  extraLabel
}: {
  card: { id: string; prompt: string };
  extraLabel: string | null;
}) {
  return (
    <article
      data-broadcast-question-card
      role="status"
      className="pointer-events-auto rounded-2xl border border-amber-300 bg-amber-50 p-3 text-right text-amber-950 shadow-md"
      dir="rtl"
    >
      <div className="flex flex-row-reverse items-start gap-1">
        <button
          type="button"
          aria-label="סגור"
          className={ICON_BUTTON}
          onClick={() => dismissUnansweredQuestionCard(card.id)}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <div className="flex min-w-0 flex-1 flex-row-reverse items-start gap-2">
          <Megaphone className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="line-clamp-4 break-words text-sm font-bold leading-snug">{card.prompt}</h2>
            {extraLabel ? (
              <Link href={MY_QUESTIONS_HREF} className="mt-1 inline-flex min-h-11 items-center text-[12px] font-semibold underline">
                {extraLabel}
              </Link>
            ) : null}
            <div className="mt-2.5 flex justify-end">
              <Link
                href={broadcastQuestionHref(card.id)}
                className="inline-flex min-h-11 items-center rounded-xl bg-[#001F3F] px-3 text-[12px] font-bold text-white"
              >
                למענה
              </Link>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

/** One remaining entry after every question card was closed. It is not an answer. */
export function UnansweredQuestionsInboxCard({ label }: { label: string }) {
  return (
    <article
      data-broadcast-question-inbox-card
      role="status"
      className="pointer-events-auto rounded-2xl border border-amber-300 bg-amber-50 p-3 text-right text-amber-950 shadow-md"
      dir="rtl"
    >
      <div className="flex min-w-0 flex-row-reverse items-start gap-2">
        <Megaphone className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold leading-snug">{label}</h2>
          <div className="mt-2.5 flex justify-end">
            <Link
              href={MY_QUESTIONS_HREF}
              className="inline-flex min-h-11 items-center rounded-xl bg-[#001F3F] px-3 text-[12px] font-bold text-white"
            >
              השאלות שלי
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
