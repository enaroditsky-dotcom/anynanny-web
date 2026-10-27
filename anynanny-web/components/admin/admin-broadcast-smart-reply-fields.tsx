"use client";

import { useState } from "react";
import { NannyTalksFrame } from "@/components/broadcast/nanny-talks-frame";
import { NANNY_THUMBS_UP_IMAGE_SRC } from "@/lib/broadcast/system-talks";
import {
  BROADCAST_SMART_REPLY_DEFAULT,
  BROADCAST_SMART_REPLY_MAX_LENGTH,
  type BroadcastSmartReplyMode
} from "@/lib/admin/broadcast-question-validation";

export type SmartReplyOption = {
  key: string;
  label: string;
  reply: string;
};

export function AdminBroadcastSmartReplyFields({
  enabled,
  mode,
  generalText,
  options,
  disabled,
  onEnabledChange,
  onModeChange,
  onGeneralTextChange,
  onOptionReplyChange
}: {
  enabled: boolean;
  mode: BroadcastSmartReplyMode;
  generalText: string;
  options: SmartReplyOption[];
  disabled?: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onModeChange: (mode: BroadcastSmartReplyMode) => void;
  onGeneralTextChange: (text: string) => void;
  onOptionReplyChange: (key: string, reply: string) => void;
}) {
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewOption = options.find((option) => option.key === previewKey) ?? options[0] ?? null;
  const previewText = mode === "general" ? generalText.trim() : previewOption?.reply.trim() ?? "";

  return (
    <details className="rounded-lg border border-navy-200 bg-slate-50 p-3">
      <summary className="cursor-pointer text-sm font-medium text-navy-900">תגובה אוטומטית לאחר מענה</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs leading-relaxed text-navy-700">
          התגובה נשלחת בנפרד לכל מי שעונה, אחרי שהתשובה נשמרת. זו לא שליחת שידור נוספת לכל הקהל.
        </p>
        <button
          type="button"
          aria-pressed={enabled}
          disabled={disabled}
          className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
            enabled ? "border-navy-800 bg-navy-800 text-white" : "border-navy-200 bg-white text-navy-800"
          }`}
          onClick={() => onEnabledChange(!enabled)}
        >
          {enabled ? "פעיל" : "כבוי"}
        </button>
        {enabled ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <ModeChoice
                checked={mode === "general"}
                label="הודעה אחידה לכל המשיבים"
                disabled={disabled}
                onSelect={() => onModeChange("general")}
              />
              <ModeChoice
                checked={mode === "by_answer"}
                label="הודעה מותאמת לפי התשובה"
                disabled={disabled}
                onSelect={() => onModeChange("by_answer")}
              />
            </div>
            {mode === "general" ? (
              <ReplyField
                id="smart-reply-general"
                label="הודעה לכל המשיבים"
                value={generalText}
                disabled={disabled}
                onChange={onGeneralTextChange}
              />
            ) : (
              <div className="space-y-3">
                {options.map((option, index) => (
                  <ReplyField
                    key={option.key}
                    id={`smart-reply-${option.key}`}
                    label={option.label.trim() || `תשובה ${index + 1}`}
                    value={option.reply}
                    disabled={disabled}
                    onChange={(reply) => onOptionReplyChange(option.key, reply)}
                  />
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2">
              {mode === "by_answer" && options.length > 1 ? (
                <label className="block min-w-0 flex-1 text-xs font-medium text-navy-800" htmlFor="smart-reply-preview-option">
                  תצוגה לפי תשובה
                  <select
                    id="smart-reply-preview-option"
                    className="mt-1 w-full rounded-lg border border-navy-200 bg-white p-2 text-sm"
                    value={previewOption?.key ?? ""}
                    onChange={(event) => setPreviewKey(event.target.value)}
                  >
                    {options.map((option, index) => (
                      <option key={option.key} value={option.key}>
                        {option.label.trim() || `תשובה ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                className="min-h-11 rounded-xl border border-navy-200 bg-white px-4 py-2 text-sm font-semibold text-navy-800 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={disabled || !previewText}
                onClick={() => setPreviewOpen(true)}
              >
                תצוגה עם נני
              </button>
            </div>
          </>
        ) : null}
      </div>
      {enabled && previewOpen ? (
        <NannyTalksFrame title="AnyNanny" imageSrc={NANNY_THUMBS_UP_IMAGE_SRC} onDismiss={() => setPreviewOpen(false)}>
          <p className="whitespace-pre-wrap text-base leading-relaxed">{previewText || BROADCAST_SMART_REPLY_DEFAULT}</p>
        </NannyTalksFrame>
      ) : null}
    </details>
  );
}

function ReplyField({
  id,
  label,
  value,
  disabled,
  onChange
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-navy-900" htmlFor={id}>
      {label}
      <textarea
        id={id}
        className="mt-1 min-h-24 w-full rounded-lg border border-navy-200 bg-white p-2 text-sm"
        maxLength={BROADCAST_SMART_REPLY_MAX_LENGTH}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value.slice(0, BROADCAST_SMART_REPLY_MAX_LENGTH))}
      />
      <span className="mt-1 block text-xs font-normal text-navy-600">
        {value.length}/{BROADCAST_SMART_REPLY_MAX_LENGTH}
      </span>
    </label>
  );
}

function ModeChoice({
  checked,
  label,
  disabled,
  onSelect
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      disabled={disabled}
      className={`min-h-11 rounded-xl border px-3 py-2 text-right text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? "border-navy-800 bg-white text-navy-900" : "border-navy-200 bg-white text-navy-700"
      }`}
      onClick={onSelect}
    >
      {label}
    </button>
  );
}
