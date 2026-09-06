"use client";

import { useMemo, useRef, useState } from "react";
import {
  BROADCAST_AUDIENCE_LABELS,
  BROADCAST_AUDIENCE_TYPES,
  type BroadcastAudienceType
} from "@/lib/admin/broadcast-audience";
import {
  BROADCAST_BODY_MAX_LENGTH,
  BROADCAST_TITLE_MAX_LENGTH,
  broadcastConfirmMessage,
  broadcastSendButtonLabel
} from "@/lib/admin/broadcast-validation";
import { BROADCAST_CTA_LABEL_MAX_LENGTH } from "@/lib/admin/broadcast-cta";

type PreviewState = {
  audience: BroadcastAudienceType;
  audience_label: string;
  recipient_count: number;
  title: string;
  body: string;
  cta_label: string | null;
  cta_route: string | null;
};

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `k_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function AdminBroadcastForm() {
  const [audience, setAudience] = useState<BroadcastAudienceType>("all_users");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaRoute, setCtaRoute] = useState("");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [busy, setBusy] = useState<"preview" | "test" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const sendKeyRef = useRef<string>(newIdempotencyKey());
  const sendingLockRef = useRef(false);

  const payload = useMemo(
    () => ({
      audience,
      title,
      body,
      cta_label: ctaLabel.trim() || undefined,
      cta_route: ctaRoute.trim() || undefined
    }),
    [audience, title, body, ctaLabel, ctaRoute]
  );

  const callApi = async (action: "preview" | "test" | "send", extra?: Record<string, unknown>) => {
    const response = await fetch("/api/admin/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload, ...extra })
    });
    const json = (await response.json().catch(() => ({}))) as {
      error?: string;
      audience?: BroadcastAudienceType;
      audience_label?: string;
      recipient_count?: number;
      title?: string;
      body?: string;
      cta_label?: string | null;
      cta_route?: string | null;
      already_sent?: boolean;
      test?: boolean;
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
      const json = await callApi("preview");
      setPreview({
        audience: json.audience ?? audience,
        audience_label: json.audience_label ?? BROADCAST_AUDIENCE_LABELS[audience],
        recipient_count: json.recipient_count ?? 0,
        title: json.title ?? title.trim(),
        body: json.body ?? body.trim(),
        cta_label: json.cta_label ?? (ctaLabel.trim() || null),
        cta_route: json.cta_route ?? (ctaRoute.trim() || null)
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
      setSuccess("הודעת הבדיקה נשלחה רק למשתמש המחובר שלך.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שליחת בדיקה נכשלה.");
    } finally {
      setBusy(null);
    }
  };

  const handleSend = async () => {
    if (sendingLockRef.current) return;
    const count = preview?.recipient_count;
    if (count == null) {
      setError("יש לפתוח תצוגה מקדימה לפני השליחה.");
      return;
    }
    const confirmed = window.confirm(broadcastConfirmMessage(count));
    if (!confirmed) return;

    sendingLockRef.current = true;
    setBusy("send");
    setError(null);
    setSuccess(null);
    try {
      const json = await callApi("send", { idempotency_key: sendKeyRef.current });
      if (json.already_sent) {
        setSuccess("ההודעה כבר נשלחה עם אותו מפתח. לא בוצעה שליחה כפולה.");
      } else {
        setSuccess(`נשלחה הודעה ל-${json.recipient_count ?? count} משתמשים.`);
        sendKeyRef.current = newIdempotencyKey();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "השליחה נכשלה.");
    } finally {
      sendingLockRef.current = false;
      setBusy(null);
    }
  };

  const sendDisabled = busy !== null || !preview;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="space-y-3 rounded-xl border border-navy-200 bg-white p-5 shadow-sm">
        <label className="block text-sm font-medium text-navy-900" htmlFor="broadcastAudience">
          קהל יעד
        </label>
        <select
          id="broadcastAudience"
          className="w-full rounded-lg border border-navy-200 p-2 text-sm"
          value={audience}
          onChange={(event) => {
            setAudience(event.target.value as BroadcastAudienceType);
            setPreview(null);
          }}
        >
          {BROADCAST_AUDIENCE_TYPES.map((value) => (
            <option key={value} value={value}>
              {BROADCAST_AUDIENCE_LABELS[value]}
            </option>
          ))}
        </select>

        <label className="block text-sm font-medium text-navy-900" htmlFor="broadcastTitle">
          כותרת
        </label>
        <input
          id="broadcastTitle"
          className="w-full rounded-lg border border-navy-200 p-2 text-sm"
          maxLength={BROADCAST_TITLE_MAX_LENGTH}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setPreview(null);
          }}
        />

        <label className="block text-sm font-medium text-navy-900" htmlFor="broadcastBody">
          הודעה
        </label>
        <textarea
          id="broadcastBody"
          className="min-h-32 w-full rounded-lg border border-navy-200 p-2 text-sm"
          maxLength={BROADCAST_BODY_MAX_LENGTH}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setPreview(null);
          }}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-navy-900" htmlFor="broadcastCtaLabel">
              תווית CTA (אופציונלי)
            </label>
            <input
              id="broadcastCtaLabel"
              className="mt-1 w-full rounded-lg border border-navy-200 p-2 text-sm"
              maxLength={BROADCAST_CTA_LABEL_MAX_LENGTH}
              value={ctaLabel}
              onChange={(event) => {
                setCtaLabel(event.target.value);
                setPreview(null);
              }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-navy-900" htmlFor="broadcastCtaRoute">
              נתיב פנימי (אופציונלי)
            </label>
            <input
              id="broadcastCtaRoute"
              className="mt-1 w-full rounded-lg border border-navy-200 p-2 text-sm"
              placeholder="/parent/profile"
              value={ctaRoute}
              onChange={(event) => {
                setCtaRoute(event.target.value);
                setPreview(null);
              }}
            />
          </div>
        </div>
        <p className="text-xs text-navy-600">
          נתיב פנימי בלבד, למשל /parent/profile, /sitter/profile, /settings. אין HTML, סקריפט, או קישורים חיצוניים.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-xl bg-navy-800 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => void handlePreview()}
            disabled={busy !== null}
          >
            {busy === "preview" ? "טוען…" : "תצוגה מקדימה"}
          </button>
          <button
            className="rounded-xl border border-navy-200 bg-white px-4 py-2 text-sm font-semibold text-navy-800 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => void handleTest()}
            disabled={busy !== null}
          >
            {busy === "test" ? "שולח בדיקה…" : "שליחת הודעת בדיקה לעצמי"}
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
          <p>
            <span className="text-navy-600">כותרת: </span>
            {preview.title}
          </p>
          <p className="whitespace-pre-wrap">
            <span className="text-navy-600">הודעה: </span>
            {preview.body}
          </p>
          {preview.cta_label || preview.cta_route ? (
            <p>
              <span className="text-navy-600">CTA: </span>
              {preview.cta_label} → {preview.cta_route}
            </p>
          ) : (
            <p className="text-navy-600">אין CTA</p>
          )}
          <button
            className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => void handleSend()}
            disabled={sendDisabled}
          >
            {busy === "send" ? "שולח…" : broadcastSendButtonLabel(preview.recipient_count)}
          </button>
        </section>
      ) : null}

      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {success ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{success}</p> : null}
    </div>
  );
}
