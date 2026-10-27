import {
  BROADCAST_AUDIENCE_LABELS,
  DEFAULT_BROADCAST_AUDIENCE,
  isBroadcastAudienceType,
  type BroadcastAudienceType
} from "@/lib/admin/broadcast-audience";
import { BROADCAST_BODY_MAX_LENGTH, BROADCAST_IDEMPOTENCY_KEY_MAX_LENGTH } from "@/lib/admin/broadcast-validation";

export const BROADCAST_QUESTION_PROMPT_MAX_LENGTH = 2000;
export const BROADCAST_QUESTION_OPTION_MAX_LENGTH = 80;
export const BROADCAST_QUESTION_OPTION_MIN_COUNT = 2;
export const BROADCAST_QUESTION_OPTION_MAX_COUNT = 12;
export const YES_NO_OPTIONS = ["כן", "לא"] as const;

export const BROADCAST_QUESTION_FORMATS = ["yes_no", "custom"] as const;
export const BROADCAST_QUESTION_SELECTION_MODES = ["single", "multiple"] as const;
export const BROADCAST_SMART_REPLY_MODES = ["general", "by_answer"] as const;
export const BROADCAST_SMART_REPLY_MAX_LENGTH = BROADCAST_BODY_MAX_LENGTH;
export const BROADCAST_SMART_REPLY_DEFAULT =
  "תודה שענית! 💚 התשובה שלך עוזרת לנו להפוך את AnyNanny לטובה יותר.";

export type BroadcastQuestionFormat = (typeof BROADCAST_QUESTION_FORMATS)[number];
export type BroadcastQuestionSelectionMode = (typeof BROADCAST_QUESTION_SELECTION_MODES)[number];
export type BroadcastSmartReplyMode = (typeof BROADCAST_SMART_REPLY_MODES)[number];

export type ValidatedSmartReplies =
  | { enabled: false }
  | { enabled: true; mode: "general"; text: string }
  | { enabled: true; mode: "by_answer"; repliesByLabel: Record<string, string> };

export type SmartReplyInput = {
  enabled?: unknown;
  mode?: unknown;
  generalText?: unknown;
  repliesByLabel?: unknown;
};

const HTML_OR_CONTROL = /[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

export type BroadcastQuestionInput = {
  audience: unknown;
  prompt: unknown;
  questionFormat: unknown;
  selectionMode: unknown;
  options: unknown;
  idempotencyKey?: unknown;
  smartReplies?: SmartReplyInput | null;
};

export type ValidatedBroadcastQuestion = {
  audience: BroadcastAudienceType;
  audienceLabel: string;
  prompt: string;
  questionFormat: BroadcastQuestionFormat;
  selectionMode: BroadcastQuestionSelectionMode;
  options: string[];
  idempotencyKey: string | null;
  smartReplies: ValidatedSmartReplies;
};

export type BroadcastQuestionDraft = {
  audience: BroadcastAudienceType;
  prompt: string;
  questionFormat: BroadcastQuestionFormat;
  selectionMode: BroadcastQuestionSelectionMode;
  customOptions: string[];
  smartRepliesEnabled?: boolean;
  smartReplyText?: string;
};

export function canAddQuestionOption(count: number): boolean {
  return count < BROADCAST_QUESTION_OPTION_MAX_COUNT;
}

export function canRemoveQuestionOption(count: number): boolean {
  return count > BROADCAST_QUESTION_OPTION_MIN_COUNT;
}

export function isBroadcastQuestionDraftDirty(draft: BroadcastQuestionDraft): boolean {
  const customDirty =
    draft.customOptions.length !== BROADCAST_QUESTION_OPTION_MIN_COUNT ||
    draft.customOptions.some((label) => label.trim() !== "");
  return (
    draft.audience !== DEFAULT_BROADCAST_AUDIENCE ||
    draft.prompt.trim() !== "" ||
    draft.questionFormat !== "yes_no" ||
    draft.selectionMode !== "single" ||
    customDirty ||
    Boolean(draft.smartRepliesEnabled) ||
    Boolean(draft.smartReplyText?.trim())
  );
}

function asSmartReplyText(value: unknown): string | { error: string } {
  if (typeof value !== "string") return { error: "נא לכתוב את התגובה האוטומטית." };
  const text = value.replace(/\r\n/g, "\n").trim();
  if (!text) return { error: "נא לכתוב את התגובה האוטומטית." };
  if (text.length > BROADCAST_SMART_REPLY_MAX_LENGTH) return { error: "התגובה האוטומטית ארוכה מדי." };
  if (HTML_OR_CONTROL.test(text)) return { error: "התגובה האוטומטית חייבת להיות טקסט פשוט." };
  return text;
}

export function validateSmartReplies(
  input: SmartReplyInput | null | undefined,
  options: string[]
): { ok: true; value: ValidatedSmartReplies } | { ok: false; error: string } {
  if (!input || input.enabled !== true) {
    return { ok: true, value: { enabled: false } };
  }

  if (input.mode !== "general" && input.mode !== "by_answer") {
    return { ok: false, error: "יש לבחור איך לשלוח את התגובה האוטומטית." };
  }

  if (input.mode === "general") {
    const text = asSmartReplyText(input.generalText);
    if (typeof text !== "string") return { ok: false, error: text.error };
    return { ok: true, value: { enabled: true, mode: "general", text } };
  }

  if (!input.repliesByLabel || typeof input.repliesByLabel !== "object" || Array.isArray(input.repliesByLabel)) {
    return { ok: false, error: "יש לכתוב תגובה לכל תשובה." };
  }

  const record = input.repliesByLabel as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== options.length || options.some((label) => !Object.prototype.hasOwnProperty.call(record, label))) {
    return { ok: false, error: "יש לכתוב תגובה לכל תשובה." };
  }

  const repliesByLabel: Record<string, string> = {};
  for (const label of options) {
    const reply = asSmartReplyText(record[label]);
    if (typeof reply !== "string") return { ok: false, error: reply.error };
    repliesByLabel[label] = reply;
  }
  return { ok: true, value: { enabled: true, mode: "by_answer", repliesByLabel } };
}

export function smartReplyRpcArgs(value: ValidatedSmartReplies): {
  enabled: boolean;
  mode: string | null;
  text: string | null;
  replies: Record<string, string>;
} {
  if (!value.enabled) {
    return { enabled: false, mode: null, text: null, replies: {} };
  }
  if (value.mode === "general") {
    return { enabled: true, mode: "general", text: value.text, replies: {} };
  }
  return { enabled: true, mode: "by_answer", text: null, replies: value.repliesByLabel };
}

export function broadcastQuestionConfirmMessage(audienceLabel: string, recipientCount: number): string {
  return `את/ה עומד/ת לשלוח שאלה לקהל ${audienceLabel}, ל-${recipientCount} משתמשים. לא ניתן לבטל שליחה שכבר יצאה. להמשיך?`;
}

function asPrompt(value: unknown): string | { error: string } {
  if (typeof value !== "string") return { error: "נא להזין שאלה." };
  const text = value.replace(/\r\n/g, "\n").trim();
  if (!text) return { error: "נא להזין שאלה." };
  if (text.length > BROADCAST_QUESTION_PROMPT_MAX_LENGTH) return { error: "השאלה ארוכה מדי." };
  if (HTML_OR_CONTROL.test(text)) return { error: "השאלה חייבת להיות טקסט פשוט." };
  return text;
}

function asOptionLabel(value: unknown): string | { error: string } {
  if (typeof value !== "string") return { error: "נא למלא כל תשובה." };
  const text = value.replace(/\r\n/g, "\n").trim();
  if (!text) return { error: "נא למלא כל תשובה." };
  if (text.length > BROADCAST_QUESTION_OPTION_MAX_LENGTH) return { error: "תשובה ארוכה מדי." };
  if (text.includes("\n")) return { error: "כל תשובה חייבת להיות בשורה אחת." };
  if (HTML_OR_CONTROL.test(text)) return { error: "תשובה חייבת להיות טקסט פשוט." };
  return text;
}

export function validateBroadcastQuestion(
  input: BroadcastQuestionInput
): { ok: true; value: ValidatedBroadcastQuestion } | { ok: false; error: string } {
  if (!isBroadcastAudienceType(input.audience)) {
    return { ok: false, error: "קהל היעד אינו תקין." };
  }

  const prompt = asPrompt(input.prompt);
  if (typeof prompt !== "string") return { ok: false, error: prompt.error };

  if (input.questionFormat !== "yes_no" && input.questionFormat !== "custom") {
    return { ok: false, error: "סוג התשובות אינו תקין." };
  }

  if (input.selectionMode !== "single" && input.selectionMode !== "multiple") {
    return { ok: false, error: "אופן הבחירה אינו תקין." };
  }

  if (input.questionFormat === "yes_no" && input.selectionMode !== "single") {
    return { ok: false, error: "שאלת כן/לא היא בחירה יחידה." };
  }

  if (!Array.isArray(input.options)) {
    return { ok: false, error: "יש להזין בין 2 ל-12 תשובות." };
  }

  if (
    input.options.length < BROADCAST_QUESTION_OPTION_MIN_COUNT ||
    input.options.length > BROADCAST_QUESTION_OPTION_MAX_COUNT
  ) {
    return { ok: false, error: "יש להזין בין 2 ל-12 תשובות." };
  }

  const options: string[] = [];
  for (const raw of input.options) {
    const label = asOptionLabel(raw);
    if (typeof label !== "string") return { ok: false, error: label.error };
    options.push(label);
  }

  if (new Set(options).size !== options.length) {
    return { ok: false, error: "אי אפשר לחזור על אותה תשובה." };
  }

  if (
    input.questionFormat === "yes_no" &&
    (options.length !== YES_NO_OPTIONS.length ||
      options[0] !== YES_NO_OPTIONS[0] ||
      options[1] !== YES_NO_OPTIONS[1])
  ) {
    return { ok: false, error: "שאלת כן/לא כוללת רק את האפשרויות כן ולא." };
  }

  const smartReplies = validateSmartReplies(input.smartReplies, options);
  if (!smartReplies.ok) return { ok: false, error: smartReplies.error };

  let idempotencyKey: string | null = null;
  if (input.idempotencyKey != null && String(input.idempotencyKey).trim()) {
    const key = String(input.idempotencyKey).trim();
    if (key.length > BROADCAST_IDEMPOTENCY_KEY_MAX_LENGTH || !/^[A-Za-z0-9:_-]+$/.test(key)) {
      return { ok: false, error: "מפתח השליחה אינו תקין." };
    }
    idempotencyKey = key;
  }

  return {
    ok: true,
    value: {
      audience: input.audience,
      audienceLabel: BROADCAST_AUDIENCE_LABELS[input.audience],
      prompt,
      questionFormat: input.questionFormat,
      selectionMode: input.selectionMode,
      options,
      idempotencyKey,
      smartReplies: smartReplies.value
    }
  };
}
