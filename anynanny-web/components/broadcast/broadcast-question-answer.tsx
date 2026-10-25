"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { broadcastQuestionHomeHref, MY_QUESTIONS_HREF } from "@/lib/broadcast/question-link";
import {
  loadBroadcastQuestionForCurrentUser,
  submitBroadcastQuestionAnswer,
  type BroadcastQuestionView
} from "@/lib/broadcast/question-answer";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const QUESTION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function BroadcastQuestionAnswer({ questionId }: { questionId: string }) {
  const router = useRouter();
  const { isLoading, signedIn, user, effectiveRole } = useAuth();
  const userId = signedIn && user?.id ? user.id : null;
  const validId = QUESTION_ID.test(questionId) ? questionId : null;
  const [question, setQuestion] = useState<BroadcastQuestionView | null>(null);
  const [loadedForUserId, setLoadedForUserId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(Boolean(validId));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const visibleQuestion = loadedForUserId === userId ? question : null;

  useEffect(() => {
    if (isLoading || userId || !validId) return;
    router.replace(`/auth/login?next=${encodeURIComponent(`/broadcast/question/${validId}`)}`);
  }, [isLoading, userId, validId, router]);

  useEffect(() => {
    setQuestion(null);
    setLoadedForUserId(null);
    setSelected([]);
    setSaved(false);
    setError(null);
    setSubmitting(false);
    if (!validId || isLoading || !userId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      setError("לא הצלחנו לטעון את השאלה. נסו שוב.");
      return;
    }

    let cancelled = false;
    setLoading(true);
    void loadBroadcastQuestionForCurrentUser(supabase, validId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setQuestion(null);
        setLoadedForUserId(userId);
        setError(result.message);
        return;
      }
      setQuestion(result.question);
      setLoadedForUserId(userId);
      setSelected(result.question.selectedOptionIds);
      setSaved(result.question.selectedOptionIds.length > 0);
    });
    return () => {
      cancelled = true;
    };
  }, [validId, isLoading, userId]);

  const closed = Boolean(visibleQuestion?.closedAt);
  const multiple = visibleQuestion?.selectionMode === "multiple";
  const homeHref = broadcastQuestionHomeHref(effectiveRole);

  const toggle = (optionId: string) => {
    if (!visibleQuestion || closed || submitting) return;
    setError(null);
    if (visibleQuestion.selectionMode === "single") {
      setSelected([optionId]);
      return;
    }
    setSelected((current) =>
      current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId]
    );
  };

  const submit = async () => {
    if (!visibleQuestion || !validId || closed || submitting) return;
    if (selected.length === 0) {
      setError(multiple ? "יש לבחור לפחות תשובה אחת." : "יש לבחור תשובה אחת.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("לא הצלחנו לשמור את התשובה. נסו שוב.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await submitBroadcastQuestionAnswer(supabase, validId, selected);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSelected(result.optionIds);
    setSaved(true);
    setQuestion((current) => (current ? { ...current, selectedOptionIds: result.optionIds } : current));
  };

  return (
    <main className="mx-auto w-full max-w-lg px-2 py-4 text-right" dir="rtl">
      <p className="text-sm font-semibold text-[#001F3F]">AnyNanny</p>
      <h1 className="mt-1 text-2xl font-semibold text-[#001F3F]">שאלה</h1>
      <Link href={MY_QUESTIONS_HREF} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#001F3F] underline">
        השאלות שלי
      </Link>
      {validId && (loading || isLoading) ? <p className="mt-6 text-sm text-[#001F3F]/80">טוען את השאלה…</p> : null}
      {!isLoading && !validId ? (
        <p className="mt-6 text-sm text-rose-700" role="alert">
          השאלה לא זמינה עבורך.
        </p>
      ) : null}
      {!loading && error ? (
        <p className="mt-4 text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
      {visibleQuestion ? (
        <section className="mt-4 rounded-2xl border border-[#001F3F]/15 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold leading-snug text-[#001F3F]">
            {visibleQuestion.prompt.length > 80 ? visibleQuestion.prompt.slice(0, 80) : visibleQuestion.prompt}
          </h2>
          {visibleQuestion.prompt.length > 80 ? (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#001F3F]/85">{visibleQuestion.prompt}</p>
          ) : null}
          {closed ? <p className="mt-3 text-sm font-medium text-[#001F3F]/70">השאלה נסגרה.</p> : null}
          {saved ? (
            <>
              <p className="mt-3 text-sm font-semibold text-emerald-800" role="status">
                התשובה נשמרה.
              </p>
              <Link
                href={homeHref}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[#001F3F] px-4 text-base font-bold text-white"
              >
                סגור
              </Link>
            </>
          ) : null}
          <fieldset className="mt-4 space-y-2" disabled={closed || submitting}>
            <legend className="sr-only">תשובות</legend>
            {visibleQuestion.questionFormat === "yes_no"
              ? visibleQuestion.options.map((option) => {
                  const active = selected.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={active}
                      className={`flex min-h-11 w-full items-center justify-center rounded-xl border px-4 text-base font-semibold ${
                        active
                          ? "border-[#001F3F] bg-[#001F3F] text-white"
                          : "border-[#001F3F]/20 bg-white text-[#001F3F]"
                      }`}
                      onClick={() => toggle(option.id)}
                    >
                      {option.label}
                    </button>
                  );
                })
              : visibleQuestion.options.map((option) => (
                  <label
                    key={option.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-[#001F3F]/15 px-3 text-base text-[#001F3F]"
                  >
                    <input
                      className="h-5 w-5 accent-[#001F3F]"
                      type={multiple ? "checkbox" : "radio"}
                      name="broadcast-question-option"
                      checked={selected.includes(option.id)}
                      onChange={() => toggle(option.id)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
          </fieldset>
          {closed ? null : (
            <button
              type="button"
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[#001F3F] px-4 text-base font-bold text-white disabled:opacity-60"
              disabled={submitting || selected.length === 0}
              onClick={() => void submit()}
            >
              {submitting ? "שומר…" : saved ? "עדכון תשובה" : "שליחת תשובה"}
            </button>
          )}
        </section>
      ) : null}
    </main>
  );
}
