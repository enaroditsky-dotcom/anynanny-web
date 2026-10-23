"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BROADCAST_AUDIENCE_LABELS,
  BROADCAST_AUDIENCE_TYPES,
  type BroadcastAudienceType
} from "@/lib/admin/broadcast-audience";
import { formatPercent, type QuestionResultScope } from "@/lib/admin/broadcast-question-results";

type HistoryItem = {
  id: string;
  prompt: string;
  created_at: string;
  closed_at: string | null;
  audience_label: string;
  format_label: string;
  selection_label: string;
  is_test: boolean;
  recipients: number;
  respondents: number;
  response_rate: number;
};

type Detail = {
  question: HistoryItem & {
    nonrespondents: number;
    percentages_may_exceed_100: boolean;
    closed: boolean;
    question_format: string;
    selection_mode: string;
    audience_type: string;
  };
  options: Array<{ id: string; label: string; selections: number; percentOfRespondents: number }>;
  respondents: Array<{
    role_label: string;
    parent_public_id: string | null;
    sitter_public_id: string | null;
    answers: string[];
    first_responded_at: string | null;
    last_responded_at: string | null;
    responded: boolean;
  }>;
  page: number;
  pageSize: number;
  total: number;
};

const CLOSE_CONFIRM = "לסגור את השאלה? לא ניתן יהיה לענות או לעדכן תשובות. התוצאות והנמענים יישמרו, ולא תישלח הודעה נוספת.";

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" });
}

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(json.error || "הפעולה נכשלה.");
  return json;
}

export function AdminBroadcastQuestionResults() {
  const [scope, setScope] = useState<QuestionResultScope>("real");
  const [audience, setAudience] = useState<BroadcastAudienceType | "">("");
  const [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historySize, setHistorySize] = useState(20);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [status, setStatus] = useState<"all" | "responded" | "not_responded">("all");
  const [optionId, setOptionId] = useState("");
  const [query, setQuery] = useState("");
  const [respondentPage, setRespondentPage] = useState(1);
  const [closing, setClosing] = useState(false);
  const [detailVersion, setDetailVersion] = useState(0);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setHistoryError(null);
    const params = new URLSearchParams({ scope, page: String(historyPage) });
    if (audience) params.set("audience", audience);
    try {
      const json = await readJson<{ questions: HistoryItem[]; total: number; pageSize: number }>(
        await fetch(`/api/admin/broadcast/questions?${params}`)
      );
      setHistory(json.questions);
      setHistoryTotal(json.total);
      setHistorySize(json.pageSize);
    } catch (error) {
      setHistory([]);
      setHistoryTotal(0);
      setHistoryError(error instanceof Error ? error.message : "לא הצלחנו לטעון את השאלות.");
    } finally {
      setLoadingHistory(false);
    }
  }, [scope, audience, historyPage]);

  const loadDetail = useCallback(async (questionId: string) => {
    const params = new URLSearchParams({ page: String(respondentPage), status });
    if (optionId) params.set("option", optionId);
    if (query.trim()) params.set("q", query.trim());
    return readJson<Detail>(await fetch(`/api/admin/broadcast/questions/${questionId}?${params}`));
  }, [respondentPage, status, optionId, query]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoadingDetail(true);
    setDetail(null);
    setDetailError(null);
    void loadDetail(selectedId)
      .then((json) => {
        if (!cancelled) setDetail(json);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setDetail(null);
        setDetailError(error instanceof Error ? error.message : "לא הצלחנו לטעון את התוצאות.");
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, loadDetail, detailVersion]);

  const closeQuestion = async () => {
    if (!selectedId || !detail || detail.question.id !== selectedId || closing) return;
    if (!window.confirm(CLOSE_CONFIRM)) return;
    const questionId = selectedId;
    setClosing(true);
    setDetailError(null);
    try {
      await readJson(await fetch(`/api/admin/broadcast/questions/${questionId}/close`, { method: "POST" }));
      await loadHistory();
      setDetailVersion((version) => version + 1);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "לא הצלחנו לסגור את השאלה.");
    } finally {
      setClosing(false);
    }
  };

  const historyPages = Math.max(1, Math.ceil(historyTotal / historySize));
  const respondentPages = Math.max(1, Math.ceil((detail?.total ?? 0) / (detail?.pageSize ?? 25)));

  return (
    <section className="mt-12 space-y-5" dir="rtl">
      <div>
        <h2 className="text-xl font-semibold text-navy-900">תוצאות שאלות</h2>
        <p className="mt-1 text-sm text-navy-700">
          הנמענים נקבעים לפי רשימת השליחה. שינוי בפרופיל אחר כך לא משנה את האוכלוסייה.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex gap-2">
          <FilterButton active={scope === "real"} label="שאלות אמיתיות" onClick={() => { setScope("real"); setHistoryPage(1); setSelectedId(null); setDetail(null); }} />
          <FilterButton active={scope === "test"} label="שאלות בדיקה" onClick={() => { setScope("test"); setHistoryPage(1); setSelectedId(null); setDetail(null); }} />
        </div>
        <label className="block text-sm text-navy-900">
          קהל יעד
          <select
            className="mt-1 min-h-11 w-full rounded-lg border border-navy-700/30 bg-white px-3 sm:w-64"
            value={audience}
            onChange={(event) => {
              setAudience(event.target.value as BroadcastAudienceType | "");
              setHistoryPage(1);
            }}
          >
            <option value="">כל הקהלים</option>
            {BROADCAST_AUDIENCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {BROADCAST_AUDIENCE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loadingHistory ? <p className="text-sm text-navy-700">טוען שאלות…</p> : null}
      {historyError ? <p className="text-sm text-rose-700" role="alert">{historyError}</p> : null}
      {!loadingHistory && !historyError && history.length === 0 ? (
        <p className="text-sm text-navy-700">אין שאלות להצגה.</p>
      ) : null}

      <div className="space-y-3">
        {history.map((item) => (
          <article key={item.id} className="rounded-2xl border border-navy-700/20 bg-white p-4">
            <p className="whitespace-pre-wrap text-sm font-semibold leading-snug text-navy-900">{item.prompt}</p>
            <dl className="mt-3 grid gap-2 text-xs text-navy-700 sm:grid-cols-2">
              <div>נשלחה: {formatWhen(item.created_at)}</div>
              <div>קהל: {item.audience_label}</div>
              <div>סוג: {item.format_label} · {item.selection_label}</div>
              <div>סטטוס: {item.closed_at ? "סגורה" : "פתוחה"} · {item.is_test ? "בדיקה" : "אמיתית"}</div>
              <div>נמענים: {item.recipients}</div>
              <div>ענו: {item.respondents} · מענה: {formatPercent(item.response_rate)}</div>
            </dl>
            <button
              type="button"
              className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-navy-800 px-4 text-sm font-bold text-white"
              onClick={() => {
                setSelectedId(item.id);
                setRespondentPage(1);
                setStatus("all");
                setOptionId("");
                setQuery("");
              }}
            >
              תוצאות מפורטות
            </button>
          </article>
        ))}
      </div>
      <Pager page={historyPage} pages={historyPages} onPage={setHistoryPage} />

      {selectedId ? (
        <div className="rounded-2xl border border-navy-700/20 bg-white p-4">
          {loadingDetail && !detail ? <p className="text-sm text-navy-700">טוען תוצאות…</p> : null}
          {detailError ? <p className="mb-3 text-sm text-rose-700" role="alert">{detailError}</p> : null}
          {detail ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-navy-900">{detail.question.prompt}</h3>
                  <p className="mt-1 text-sm text-navy-700">
                    {detail.question.closed ? "סגורה" : "פתוחה"} · {detail.question.audience_label} · {detail.question.is_test ? "בדיקה" : "אמיתית"}
                  </p>
                </div>
                {detail.question.closed ? null : (
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-rose-300 px-4 text-sm font-bold text-rose-800 disabled:opacity-60"
                    disabled={closing}
                    onClick={() => void closeQuestion()}
                  >
                    {closing ? "סוגר…" : "סגירת שאלה"}
                  </button>
                )}
              </div>

              <dl className="grid gap-3 sm:grid-cols-4">
                <Stat label="נמענים" value={String(detail.question.recipients)} />
                <Stat label="ענו" value={String(detail.question.respondents)} />
                <Stat label="לא ענו" value={String(detail.question.nonrespondents)} />
                <Stat label="אחוז מענה" value={formatPercent(detail.question.response_rate)} />
              </dl>

              <div className="space-y-2">
                {detail.options.map((option) => (
                  <div key={option.id}>
                    <div className="flex justify-between gap-3 text-sm text-navy-900">
                      <span>{option.label}</span>
                      <span>{option.selections} · {formatPercent(option.percentOfRespondents)}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-navy-700/15">
                      <div
                        className="h-full bg-navy-800"
                        style={{ width: `${Math.min(100, option.percentOfRespondents)}%` }}
                      />
                    </div>
                  </div>
                ))}
                {detail.question.percentages_may_exceed_100 ? (
                  <p className="text-xs text-navy-700">
                    כל אחוז הוא מתוך מספר העונים, לא מתוך מספר הבחירות. בשאלה עם כמה תשובות הסכום יכול לעבור 100%.
                  </p>
                ) : (
                  <p className="text-xs text-navy-700">כל עונה נספר פעם אחת, לפי הבחירה השמורה כרגע.</p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm text-navy-900">
                  סטטוס
                  <select
                    className="mt-1 min-h-11 w-full rounded-lg border border-navy-700/30 px-3"
                    value={status}
                    onChange={(event) => {
                      setStatus(event.target.value as typeof status);
                      setRespondentPage(1);
                    }}
                  >
                    <option value="all">כולם</option>
                    <option value="responded">ענו</option>
                    <option value="not_responded">לא ענו</option>
                  </select>
                </label>
                <label className="text-sm text-navy-900">
                  תשובה
                  <select
                    className="mt-1 min-h-11 w-full rounded-lg border border-navy-700/30 px-3"
                    value={optionId}
                    onChange={(event) => {
                      setOptionId(event.target.value);
                      setRespondentPage(1);
                    }}
                  >
                    <option value="">כל התשובות</option>
                    {detail.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-navy-900">
                  מזהה ציבורי
                  <input
                    className="mt-1 min-h-11 w-full rounded-lg border border-navy-700/30 px-3"
                    value={query}
                    placeholder="RP-1001 או RAN-1001"
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setRespondentPage(1);
                    }}
                  />
                </label>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-right text-sm">
                  <thead className="text-xs text-navy-700">
                    <tr>
                      <th className="px-2 py-2 font-medium">מזהה הורה</th>
                      <th className="px-2 py-2 font-medium">מזהה נני</th>
                      <th className="px-2 py-2 font-medium">תפקיד</th>
                      <th className="px-2 py-2 font-medium">תשובות</th>
                      <th className="px-2 py-2 font-medium">מענה ראשון</th>
                      <th className="px-2 py-2 font-medium">עדכון אחרון</th>
                      <th className="px-2 py-2 font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.respondents.length === 0 ? (
                      <tr>
                        <td className="px-2 py-4 text-navy-700" colSpan={7}>אין נמענים תואמים.</td>
                      </tr>
                    ) : (
                      detail.respondents.map((row, index) => (
                        <tr key={`${row.parent_public_id ?? ""}-${row.sitter_public_id ?? ""}-${index}`} className="border-t border-navy-700/15">
                          <td className="px-2 py-2">{row.parent_public_id ?? "—"}</td>
                          <td className="px-2 py-2">{row.sitter_public_id ?? "—"}</td>
                          <td className="px-2 py-2">{row.role_label}</td>
                          <td className="px-2 py-2">{row.answers.length > 0 ? row.answers.join(", ") : "—"}</td>
                          <td className="px-2 py-2">{formatWhen(row.first_responded_at)}</td>
                          <td className="px-2 py-2">{formatWhen(row.last_responded_at)}</td>
                          <td className="px-2 py-2">{row.responded ? "ענה" : "לא ענה"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pager page={respondentPage} pages={respondentPages} onPage={setRespondentPage} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function FilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold ${
        active ? "border-navy-800 bg-navy-800 text-white" : "border-navy-700/30 bg-white text-navy-900"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-navy-700/10 px-3 py-2">
      <div className="text-xs text-navy-700">{label}</div>
      <div className="text-lg font-semibold text-navy-900">{value}</div>
    </div>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <button type="button" className="min-h-11 rounded-lg border border-navy-700/30 px-3 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        הקודם
      </button>
      <span className="text-navy-700">{page} / {pages}</span>
      <button type="button" className="min-h-11 rounded-lg border border-navy-700/30 px-3 disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        הבא
      </button>
    </div>
  );
}
