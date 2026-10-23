"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { PageBackLink, PageBackRow } from "@/components/navigation/page-back-link";
import { broadcastQuestionHref, MY_QUESTIONS_HREF } from "@/lib/broadcast/question-link";
import type { MyQuestionStatus } from "@/lib/broadcast/question-inbox";

type QuestionRow = {
  id: string;
  prompt: string;
  createdAt: string;
  closedAt: string | null;
  answered: boolean;
  closed: boolean;
};

const FILTERS: Array<{ id: MyQuestionStatus; label: string }> = [
  { id: "pending", label: "ממתינות" },
  { id: "answered", label: "שנענו" },
  { id: "closed", label: "סגורות" }
];

function formatWhen(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" });
}

function statusLabel(row: QuestionRow): string {
  if (row.closed && row.answered) return "נענתה · סגורה";
  if (row.closed) return "סגורה";
  if (row.answered) return "נענתה";
  return "ממתינה";
}

export function MyBroadcastQuestions() {
  const router = useRouter();
  const { isLoading, signedIn, user, effectiveRole } = useAuth();
  const userId = signedIn && user?.id ? user.id : null;
  const [status, setStatus] = useState<MyQuestionStatus>("pending");
  const [page, setPage] = useState(1);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [loadedForUserId, setLoadedForUserId] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const visibleQuestions = loadedForUserId === userId ? questions : [];

  useEffect(() => {
    if (isLoading || userId) return;
    router.replace(`/auth/login?next=${encodeURIComponent(MY_QUESTIONS_HREF)}`);
  }, [isLoading, userId, router]);

  useEffect(() => {
    setQuestions([]);
    setLoadedForUserId(null);
    setTotal(0);
    setError(null);
    if (isLoading || !userId) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ status, page: String(page) });
    void fetch(`/api/broadcast/questions?${params}`)
      .then(async (response) => {
        const json = (await response.json().catch(() => ({}))) as {
          error?: string;
          questions?: QuestionRow[];
          total?: number;
          pageSize?: number;
        };
        if (!response.ok) throw new Error(json.error || "לא הצלחנו לטעון את השאלות.");
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setQuestions(json.questions ?? []);
        setLoadedForUserId(userId);
        setTotal(json.total ?? 0);
        setPageSize(json.pageSize ?? 20);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setQuestions([]);
        setLoadedForUserId(userId);
        setTotal(0);
        setError(err instanceof Error ? err.message : "לא הצלחנו לטעון את השאלות.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, isLoading, status, page]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const backHref = effectiveRole === "sitter" ? "/sitter/settings" : "/parent/settings";
  const empty =
    status === "answered" ? "אין שאלות שנענו." : status === "closed" ? "אין שאלות סגורות." : "אין שאלות ממתינות.";

  return (
    <main className="mx-auto w-full max-w-lg px-3 py-4 text-right" dir="rtl">
      <PageBackRow>
        <PageBackLink href={backHref} />
      </PageBackRow>
      <h1 className="mt-3 text-2xl font-semibold text-[#001F3F]">השאלות שלי</h1>
      <p className="mt-1 text-sm text-[#001F3F]/75">
        שאלות שמחכות לתשובה, ותשובות שכבר נשמרו. סגירת הכרטיס אינה נחשבת למענה.
      </p>
      <div className="mt-4 flex gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={`inline-flex min-h-11 items-center rounded-xl border px-3 text-sm font-semibold ${
              status === filter.id ? "border-[#001F3F] bg-[#001F3F] text-white" : "border-[#001F3F]/20 bg-white text-[#001F3F]"
            }`}
            onClick={() => {
              setStatus(filter.id);
              setPage(1);
            }}
          >
            {filter.label}
          </button>
        ))}
      </div>
      {loading || isLoading ? <p className="mt-6 text-sm text-[#001F3F]/80">טוען שאלות…</p> : null}
      {error ? (
        <p className="mt-4 text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && !error && visibleQuestions.length === 0 ? <p className="mt-6 text-sm text-[#001F3F]/75">{empty}</p> : null}
      <div className="mt-4 space-y-3">
        {visibleQuestions.map((row) => (
          <article key={row.id} className="rounded-2xl border border-[#001F3F]/15 bg-white p-4">
            <p className="whitespace-pre-wrap text-sm font-semibold leading-snug text-[#001F3F]">{row.prompt}</p>
            <p className="mt-2 text-xs text-[#001F3F]/70">
              {statusLabel(row)}
              {formatWhen(row.createdAt) ? ` · ${formatWhen(row.createdAt)}` : ""}
            </p>
            <Link
              href={broadcastQuestionHref(row.id)}
              className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-[#001F3F] px-4 text-sm font-bold text-white"
            >
              {row.closed ? "צפייה" : row.answered ? "עדכון תשובה" : "למענה"}
            </Link>
          </article>
        ))}
      </div>
      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            className="min-h-11 rounded-lg border border-[#001F3F]/20 px-3 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            הקודם
          </button>
          <span className="text-[#001F3F]/70">
            {page} / {pages}
          </span>
          <button
            type="button"
            className="min-h-11 rounded-lg border border-[#001F3F]/20 px-3 disabled:opacity-40"
            disabled={page >= pages}
            onClick={() => setPage((current) => current + 1)}
          >
            הבא
          </button>
        </div>
      ) : null}
    </main>
  );
}
