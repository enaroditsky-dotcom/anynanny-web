"use client";

import { useState } from "react";
import {
  mergeSelectedPublicIds,
  selectedPublicIdReasonLabel,
  type SelectedPublicIdEntry
} from "@/lib/admin/broadcast-selected-recipients";

export function SelectedPublicIdField(props: {
  ids: string[];
  entries?: SelectedPublicIdEntry[];
  disabled?: boolean;
  inputId?: string;
  onChange: (ids: string[]) => void;
}) {
  const inputId = props.inputId ?? "selectedPublicIds";
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const status = new Map((props.entries ?? []).map((entry) => [entry.publicId, entry]));

  const add = () => {
    const merged = mergeSelectedPublicIds(props.ids, draft);
    if (!merged.ok) {
      setError(merged.error);
      return;
    }
    setError(null);
    setDraft("");
    props.onChange(merged.ids);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-navy-900" htmlFor={inputId}>
        מזהים ציבוריים
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <textarea
          id={inputId}
          className="min-h-20 w-full rounded-lg border border-navy-200 p-2 text-sm"
          placeholder={"RP-1001, RAN-1004\nP-1002"}
          value={draft}
          disabled={props.disabled}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
        />
        <button
          className="rounded-xl border border-navy-200 bg-white px-4 py-2 text-sm font-semibold text-navy-800 disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={add}
          disabled={props.disabled}
        >
          הוסף
        </button>
      </div>
      <p className="text-xs text-navy-600">
        RP- או P- להורה, RAN-, AN- או CONS- לנני. אפשר להדביק כמה מזהים מופרדים בפסיק, רווח או שורה.
        שליחת הבדיקה אינה משתמשת ברשימה הזו.
      </p>
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
      {props.ids.length > 0 ? (
        <ul className="space-y-2">
          {props.ids.map((id) => {
            const entry = status.get(id);
            const reason = entry && !entry.ok ? selectedPublicIdReasonLabel(entry.reason) : null;
            const role = entry?.role === "parent" ? "הורה" : entry?.role === "sitter" ? "נני" : null;
            return (
              <li
                key={id}
                className="flex items-center justify-between gap-3 rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-semibold text-navy-900">{id}</span>
                  {role ? <span className="text-navy-600"> · {role}</span> : null}
                  {entry?.ok ? <span className="text-emerald-800"> · תקין</span> : null}
                  {reason ? <span className="text-red-800"> · {reason}</span> : null}
                </span>
                <button
                  className="text-sm font-semibold text-navy-800 disabled:opacity-60"
                  type="button"
                  disabled={props.disabled}
                  onClick={() => props.onChange(props.ids.filter((item) => item !== id))}
                >
                  הסר
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-navy-600">עדיין לא נבחרו מזהים.</p>
      )}
    </div>
  );
}
