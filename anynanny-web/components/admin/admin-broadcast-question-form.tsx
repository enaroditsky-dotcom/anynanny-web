"use client";

import { useMemo, useRef, useState } from "react";
import { useAdminQuery } from "@/components/admin/use-admin-query";
import {
  BROADCAST_AUDIENCE_LABELS,
  BROADCAST_AUDIENCE_TYPES,
  DEFAULT_BROADCAST_AUDIENCE,
  isBroadcastAudienceType,
  type BroadcastAudienceType
} from "@/lib/admin/broadcast-audience";
import { AdminBroadcastSmartReplyFields } from "@/components/admin/admin-broadcast-smart-reply-fields";
import { SelectedPublicIdField } from "@/components/admin/selected-public-id-field";
import {
  parseSelectedPublicIdList,
  SELECTED_BROADCAST_AUDIENCE,
  selectedPublicIdReasonLabel,
  type SelectedPublicIdEntry
} from "@/lib/admin/broadcast-selected-recipients";
import {
  BROADCAST_QUESTION_OPTION_MAX_COUNT,
  BROADCAST_QUESTION_OPTION_MAX_LENGTH,
  BROADCAST_QUESTION_PROMPT_MAX_LENGTH,
  BROADCAST_SMART_REPLY_DEFAULT,
  YES_NO_OPTIONS,
  broadcastQuestionConfirmMessage,
  canAddQuestionOption,
  canRemoveQuestionOption,
  isBroadcastQuestionDraftDirty,
  type BroadcastQuestionFormat,
  type BroadcastQuestionSelectionMode,
  type BroadcastSmartReplyMode
} from "@/lib/admin/broadcast-question-validation";

type OptionDraft = { id: string; label: string; reply: string };

type PreviewState = {
  audience_label: string;
  recipient_count: number;
  prompt: string;
  question_format: BroadcastQuestionFormat;
  selection_mode: BroadcastQuestionSelectionMode;
  options: string[];
  ok: boolean;
  error: string | null;
  entries: SelectedPublicIdEntry[];
};

const NEW_QUESTION_LABEL = "שאלה חדשה";
const NEW_QUESTION_CONFIRM = "להתחיל שאלה חדשה? התוכן שכתבת יימחק.";
const NEW_QUESTION_CANCEL = "ביטול";
const NEW_QUESTION_CONFIRM_ACTION = "התחל שאלה חדשה";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `k_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function emptyCustomOptions(): OptionDraft[] {
  return [
    { id: "option-1", label: "", reply: "" },
    { id: "option-2", label: "", reply: "" }
  ];
}

export function AdminBroadcastQuestionForm() {
  const { params, replaceQuery } = useAdminQuery();
  const audienceParam = params.get("audience");
  const audience: BroadcastAudienceType = isBroadcastAudienceType(audienceParam)
    ? audienceParam
    : DEFAULT_BROADCAST_AUDIENCE;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [questionFormat, setQuestionFormat] = useState<BroadcastQuestionFormat>("yes_no");
  const [selectionMode, setSelectionMode] = useState<BroadcastQuestionSelectionMode>("single");
  const [customOptions, setCustomOptions] = useState<OptionDraft[]>(emptyCustomOptions);
  const [smartRepliesEnabled, setSmartRepliesEnabled] = useState(false);
  const [smartReplyMode, setSmartReplyMode] = useState<BroadcastSmartReplyMode>("general");
  const [generalReply, setGeneralReply] = useState(BROADCAST_SMART_REPLY_DEFAULT);
  const [yesNoReplies, setYesNoReplies] = useState<Record<string, string>>({
    כן: "",
    לא: ""
  });
  const [confirmNew, setConfirmNew] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [busy, setBusy] = useState<"preview" | "test" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const sendKeyRef = useRef<string>(newIdempotencyKey());
  const sendingLockRef = useRef(false);
  const nextOptionId = useRef(3);
  const [seenAudience, setSeenAudience] = useState(audience);
  if (seenAudience !== audience) {
    setSeenAudience(audience);
    setPreview(null);
    setError(null);
    setSuccess(null);
  }

  const options = useMemo(
    () => (questionFormat === "yes_no" ? [...YES_NO_OPTIONS] : customOptions.map((option) => option.label)),
    [customOptions, questionFormat]
  );
  const effectiveSelection: BroadcastQuestionSelectionMode =
    questionFormat === "yes_no" ? "single" : selectionMode;

  const payload = useMemo(() => {
    const replies: Record<string, string> = {};
    if (smartRepliesEnabled && smartReplyMode === "by_answer") {
      if (questionFormat === "yes_no") {
        for (const label of YES_NO_OPTIONS) replies[label] = yesNoReplies[label];
      } else {
        for (const option of customOptions) replies[option.label.trim()] = option.reply;
      }
    }
    return {
      audience,
      prompt,
      question_format: questionFormat,
      selection_mode: effectiveSelection,
      options,
      smart_replies_enabled: smartRepliesEnabled,
      smart_reply_mode: smartRepliesEnabled ? smartReplyMode : null,
      smart_reply_text: smartRepliesEnabled && smartReplyMode === "general" ? generalReply : null,
      smart_reply_by_label: replies
    };
  }, [
    audience,
    customOptions,
    effectiveSelection,
    generalReply,
    options,
    prompt,
    questionFormat,
    smartRepliesEnabled,
    smartReplyMode,
    yesNoReplies
  ]);

  const selectedRequest = () =>
    audience === SELECTED_BROADCAST_AUDIENCE ? { public_ids: selectedIds } : {};

  const clearPreview = () => {
    setPreview(null);
    setError(null);
    setSuccess(null);
  };

  const changeSelectedIds = (ids: string[]) => {
    setSelectedIds(ids);
    clearPreview();
  };

  const resetForm = () => {
    replaceQuery({ audience: null });
    setSelectedIds([]);
    setPrompt("");
    setQuestionFormat("yes_no");
    setSelectionMode("single");
    setCustomOptions(emptyCustomOptions());
    setSmartRepliesEnabled(false);
    setSmartReplyMode("general");
    setGeneralReply(BROADCAST_SMART_REPLY_DEFAULT);
    setYesNoReplies({ כן: "", לא: "" });
    nextOptionId.current = 3;
    setPreview(null);
    setError(null);
    setSuccess(null);
    setConfirmNew(false);
    sendKeyRef.current = newIdempotencyKey();
  };

  const requestNewQuestion = () => {
    if (busy !== null) return;
    const dirty = isBroadcastQuestionDraftDirty({
      audience,
      prompt,
      questionFormat,
      selectionMode,
      customOptions: customOptions.map((option) => option.label),
      smartRepliesEnabled,
      smartReplyText: [
        generalReply === BROADCAST_SMART_REPLY_DEFAULT ? "" : generalReply,
        ...Object.values(yesNoReplies),
        ...customOptions.map((option) => option.reply)
      ].join("")
    });
    if (!dirty) {
      resetForm();
      return;
    }
    setConfirmNew(true);
  };

  const callApi = async (action: "preview" | "test" | "send", extra?: Record<string, unknown>) => {
    const response = await fetch("/api/admin/broadcast/question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload, ...extra })
    });
    const json = (await response.json().catch(() => ({}))) as {
      error?: string;
      audience_label?: string;
      recipient_count?: number;
      prompt?: string;
      question_format?: BroadcastQuestionFormat;
      selection_mode?: BroadcastQuestionSelectionMode;
      options?: string[];
      ok?: boolean;
      entries?: Array<{ public_id?: string; role?: "parent" | "sitter" | null; ok?: boolean; reason?: string | null }>;
      already_sent?: boolean;
    };
    if (!response.ok) {
      throw new Error(json.error || "הפעולה נכשלה.");
    }
    return json;
  };

  const handlePreview = async () => {
    setBusy("preview");
    setError(null);
    setSuccess(null);
    try {
      if (audience === SELECTED_BROADCAST_AUDIENCE) {
        const parsedIds = parseSelectedPublicIdList(selectedIds);
        if (!parsedIds.ok) throw new Error(parsedIds.error);
      }
      const json = await callApi("preview", selectedRequest());
      setPreview({
        audience_label: json.audience_label ?? BROADCAST_AUDIENCE_LABELS[audience],
        recipient_count: json.recipient_count ?? 0,
        prompt: json.prompt ?? prompt.trim(),
        question_format: json.question_format ?? questionFormat,
        selection_mode: json.selection_mode ?? effectiveSelection,
        options: json.options ?? options,
        ok: json.ok !== false,
        error: typeof json.error === "string" ? json.error : null,
        entries: (json.entries ?? []).map((entry) => ({
          publicId: String(entry.public_id ?? ""),
          role: entry.role === "parent" || entry.role === "sitter" ? entry.role : null,
          ok: entry.ok === true,
          reason: entry.reason ?? null
        }))
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "תצוגה מקדימה נכשלה.");
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async () => {
    setBusy("test");
    setError(null);
    setSuccess(null);
    try {
      await callApi("test", { idempotency_key: `test_${newIdempotencyKey()}` });
      setSuccess("שאלת הבדיקה נשלחה רק לחשבון P-1002.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שליחת בדיקה נכשלה.");
    } finally {
      setBusy(null);
    }
  };

  const handleSend = async () => {
    if (sendingLockRef.current) return;
    const count = preview?.recipient_count;
    if (!preview || count == null) {
      setError("יש לפתוח תצוגה מקדימה לפני השליחה.");
      return;
    }
    if (audience === SELECTED_BROADCAST_AUDIENCE && (!preview.ok || count < 1)) {
      setError("יש לתקן את רשימת המזהים לפני השליחה.");
      return;
    }
    const confirmed = window.confirm(broadcastQuestionConfirmMessage(preview.audience_label, count));
    if (!confirmed) return;

    sendingLockRef.current = true;
    setBusy("send");
    setError(null);
    setSuccess(null);
    try {
      const json = await callApi("send", { idempotency_key: sendKeyRef.current, ...selectedRequest() });
      if (json.already_sent) {
        setSuccess("השאלה כבר נשלחה עם אותו מפתח. לא בוצעה שליחה כפולה.");
      } else {
        setSuccess(`נשלחה שאלה ל-${json.recipient_count ?? count} משתמשים.`);
        sendKeyRef.current = newIdempotencyKey();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "השליחה נכשלה.");
    } finally {
      sendingLockRef.current = false;
      setBusy(null);
    }
  };

  const addOption = () => {
    if (!canAddQuestionOption(customOptions.length)) return;
    const id = `option-${nextOptionId.current}`;
    nextOptionId.current += 1;
    setCustomOptions((current) => [...current, { id, label: "", reply: "" }]);
    clearPreview();
  };

  const sendBlocked =
    audience === SELECTED_BROADCAST_AUDIENCE &&
    (preview == null || !preview.ok || preview.recipient_count < 1);
  const sendDisabled = busy !== null || !preview || sendBlocked;

  return (
    <div className="scroll-mt-28 space-y-5 outline-none" dir="rtl" id="admin-broadcast-question" tabIndex={-1}>
      <div className="space-y-3 rounded-xl border border-navy-200 bg-white p-5 shadow-sm">
        <div id="admin-broadcast-question-audience" tabIndex={-1} className="scroll-mt-28 outline-none">
        <label className="block text-sm font-medium text-navy-900" htmlFor="questionAudience">
          קהל יעד
        </label>
        <select
          id="questionAudience"
          className="w-full rounded-lg border border-navy-200 p-2 text-sm"
          value={audience}
          onChange={(event) => {
            const value = event.target.value;
            replaceQuery({ audience: value === DEFAULT_BROADCAST_AUDIENCE ? null : value });
          }}
        >
          {BROADCAST_AUDIENCE_TYPES.map((value) => (
            <option key={value} value={value}>
              {BROADCAST_AUDIENCE_LABELS[value]}
            </option>
          ))}
        </select>
        </div>
        {audience === SELECTED_BROADCAST_AUDIENCE ? (
          <div id="admin-broadcast-question-recipients" tabIndex={-1} className="scroll-mt-28 outline-none">
            <SelectedPublicIdField
              inputId="questionSelectedPublicIds"
              ids={selectedIds}
              entries={preview?.entries ?? []}
              disabled={busy !== null}
              onChange={changeSelectedIds}
            />
          </div>
        ) : null}

        <label className="block text-sm font-medium text-navy-900" htmlFor="questionPrompt">
          שאלה
        </label>
        <textarea
          id="questionPrompt"
          className="min-h-32 w-full rounded-lg border border-navy-200 p-2 text-sm"
          maxLength={BROADCAST_QUESTION_PROMPT_MAX_LENGTH}
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
            clearPreview();
          }}
        />

        <fieldset id="admin-broadcast-question-format" tabIndex={-1} className="scroll-mt-28 space-y-2 outline-none">
          <legend className="text-sm font-medium text-navy-900">סוג תשובות</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <FormatChoice
              name="questionFormat"
              checked={questionFormat === "yes_no"}
              label="כן / לא"
              onSelect={() => {
                setQuestionFormat("yes_no");
                clearPreview();
              }}
            />
            <FormatChoice
              name="questionFormat"
              checked={questionFormat === "custom"}
              label="תשובות לבחירה"
              onSelect={() => {
                setQuestionFormat("custom");
                clearPreview();
              }}
            />
          </div>
        </fieldset>

        {questionFormat === "yes_no" ? (
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-navy-800">
            <p className="font-medium">בחירה יחידה</p>
            <ol className="mt-2 list-decimal space-y-1 pe-5">
              {YES_NO_OPTIONS.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="space-y-3">
            <fieldset id="admin-broadcast-question-selection" tabIndex={-1} className="scroll-mt-28 space-y-2 outline-none">
              <legend className="text-sm font-medium text-navy-900">אופן הבחירה</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <FormatChoice
                  name="questionSelection"
                  checked={selectionMode === "single"}
                  label="בחירה אחת"
                  onSelect={() => {
                    setSelectionMode("single");
                    clearPreview();
                  }}
                />
                <FormatChoice
                  name="questionSelection"
                  checked={selectionMode === "multiple"}
                  label="כמה תשובות"
                  onSelect={() => {
                    setSelectionMode("multiple");
                    clearPreview();
                  }}
                />
              </div>
            </fieldset>

            <div className="space-y-2">
              {customOptions.map((option, index) => (
                <div key={option.id} className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={option.id}>
                    תשובה {index + 1}
                  </label>
                  <input
                    id={option.id}
                    className="min-w-0 flex-1 rounded-lg border border-navy-200 p-2 text-sm"
                    maxLength={BROADCAST_QUESTION_OPTION_MAX_LENGTH}
                    value={option.label}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCustomOptions((current) =>
                        current.map((item) => (item.id === option.id ? { ...item, label: value } : item))
                      );
                      clearPreview();
                    }}
                  />
                  <button
                    type="button"
                    className="min-h-11 shrink-0 rounded-lg border border-navy-200 px-3 text-sm font-semibold text-navy-800 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!canRemoveQuestionOption(customOptions.length)}
                    onClick={() => {
                      if (!canRemoveQuestionOption(customOptions.length)) return;
                      setCustomOptions((current) => current.filter((item) => item.id !== option.id));
                      clearPreview();
                    }}
                  >
                    הסר
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-navy-600">
              {customOptions.length} / {BROADCAST_QUESTION_OPTION_MAX_COUNT} תשובות. נדרשות לפחות שתי תשובות.
              {canAddQuestionOption(customOptions.length)
                ? ""
                : " אפשר להוסיף עד 12 תשובות."}
            </p>
            <button
              type="button"
              className="min-h-11 rounded-xl border border-navy-200 bg-white px-4 py-2 text-sm font-semibold text-navy-800 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canAddQuestionOption(customOptions.length)}
              onClick={addOption}
            >
              + הוסף תשובה
            </button>
          </div>
        )}

        <AdminBroadcastSmartReplyFields
          enabled={smartRepliesEnabled}
          mode={smartReplyMode}
          generalText={generalReply}
          disabled={busy !== null}
          options={
            questionFormat === "yes_no"
              ? YES_NO_OPTIONS.map((label) => ({ key: label, label, reply: yesNoReplies[label] }))
              : customOptions.map((option) => ({ key: option.id, label: option.label, reply: option.reply }))
          }
          onEnabledChange={(next) => {
            setSmartRepliesEnabled(next);
            clearPreview();
          }}
          onModeChange={(next) => {
            setSmartReplyMode(next);
            clearPreview();
          }}
          onGeneralTextChange={(text) => {
            setGeneralReply(text);
            clearPreview();
          }}
          onOptionReplyChange={(key, reply) => {
            if (questionFormat === "yes_no") {
              setYesNoReplies((current) => ({ ...current, [key]: reply }));
            } else {
              setCustomOptions((current) => current.map((option) => (option.id === key ? { ...option, reply } : option)));
            }
            clearPreview();
          }}
        />

        <div className="flex flex-wrap gap-2">
          <button
            id="admin-broadcast-question-preview"
            className="rounded-xl bg-navy-800 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => void handlePreview()}
            disabled={busy !== null}
          >
            {busy === "preview" ? "טוען…" : "תצוגה מקדימה"}
          </button>
          <button
            id="admin-broadcast-question-test"
            className="rounded-xl border border-navy-200 bg-white px-4 py-2 text-sm font-semibold text-navy-800 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => void handleTest()}
            disabled={busy !== null}
          >
            {busy === "test" ? "שולח בדיקה…" : "שליחת בדיקה לחשבון P-1002"}
          </button>
          <button
            id="admin-broadcast-question-new"
            className="rounded-xl border border-navy-200 bg-white px-4 py-2 text-sm font-semibold text-navy-800 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={requestNewQuestion}
            disabled={busy !== null}
          >
            {NEW_QUESTION_LABEL}
          </button>
        </div>
      </div>

      {preview ? (
        <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-navy-900">
          <h2 className="text-base font-semibold">תצוגה מקדימה</h2>
          <p>
            <span className="text-navy-600">קהל יעד: </span>
            {preview.audience_label}
          </p>
          <p>
            <span className="text-navy-600">מספר נמענים: </span>
            {preview.recipient_count}
          </p>
          {preview.error ? (
            <p className="text-red-800">{selectedPublicIdReasonLabel(preview.error) ?? preview.error}</p>
          ) : null}
          {audience === SELECTED_BROADCAST_AUDIENCE && !preview.ok ? (
            <p className="text-red-800">השליחה חסומה עד שכל המזהים תקינים.</p>
          ) : null}
          <p>
            <span className="text-navy-600">סוג: </span>
            {preview.question_format === "yes_no" ? "כן / לא" : "תשובות לבחירה"}
            {" · "}
            {preview.selection_mode === "single" ? "בחירה אחת" : "כמה תשובות"}
          </p>
          <p className="whitespace-pre-wrap">
            <span className="text-navy-600">שאלה: </span>
            {preview.prompt}
          </p>
          <ol className="list-decimal space-y-1 pe-5">
            {preview.options.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ol>
          <button
            className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => void handleSend()}
            disabled={sendDisabled}
          >
            {busy === "send" ? "שולח…" : "שליחה לנמענים"}
          </button>
        </section>
      ) : null}

      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {success ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{success}</p> : null}

      {confirmNew ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="questionNewConfirmTitle"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 text-right shadow-lg">
            <p id="questionNewConfirmTitle" className="text-sm font-medium text-navy-900">
              {NEW_QUESTION_CONFIRM}
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-navy-200 bg-white px-4 py-2 text-sm font-semibold text-navy-800"
                onClick={() => setConfirmNew(false)}
              >
                {NEW_QUESTION_CANCEL}
              </button>
              <button
                type="button"
                className="rounded-xl bg-navy-800 px-4 py-2 text-sm font-semibold text-white"
                onClick={resetForm}
              >
                {NEW_QUESTION_CONFIRM_ACTION}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FormatChoice({
  name,
  checked,
  label,
  onSelect
}: {
  name: string;
  checked: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
        checked ? "border-navy-800 bg-navy-800 text-white" : "border-navy-200 bg-white text-navy-900"
      }`}
    >
      <input className="accent-white" type="radio" name={name} checked={checked} onChange={onSelect} />
      {label}
    </label>
  );
}
