"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";

export function PersonalAreaSection({
  title,
  description,
  accent = "navy",
  action,
  children
}: {
  title: string;
  description?: string;
  accent?: "navy" | "gold" | "emerald" | "sky";
  action?: ReactNode;
  children: ReactNode;
}) {
  const accentClass =
    accent === "gold"
      ? "border-[#C5A059]/25"
      : accent === "emerald"
        ? "border-emerald-200/80"
        : accent === "sky"
          ? "border-sky-200/80"
          : "border-navy-header/10";

  return (
    <section className={`rounded-2xl border bg-white p-4 shadow-soft sm:p-5 ${accentClass}`} dir="rtl">
      <div className="mb-3 flex items-start justify-between gap-3 text-right">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold text-[#001F3F]">{title}</h2>
          {description ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function PersonalChangeLink({
  onClick,
  label = "שינוי",
  disabled = false
}: {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-[12px] font-semibold text-[#0B6BCB] underline decoration-[#0B6BCB]/35 underline-offset-2 transition hover:text-[#08529a] hover:decoration-[#08529a] disabled:opacity-50"
    >
      {label}
    </button>
  );
}

/** Coerce any display value to a trimmed string without throwing. */
export function toDisplayString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => toDisplayString(item))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "object") {
    try {
      const json = JSON.stringify(value);
      return json === "{}" || json === "[]" || json === "null" ? "" : json;
    } catch {
      return String(value ?? "").trim();
    }
  }
  return String(value ?? "").trim();
}

export function PersonalStaticRow({
  label,
  value,
  emptyLabel = "לא הוגדר",
  onEdit,
  dir
}: {
  label: string;
  value?: unknown;
  emptyLabel?: string;
  onEdit: () => void;
  dir?: "ltr" | "rtl";
}) {
  const trimmed = toDisplayString(value);
  const isEmpty = !trimmed;

  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#001F3F]/8 py-3 last:border-b-0">
      <div className="min-w-0 flex-1 text-right">
        <p className="text-[11px] font-semibold text-slate-500">{label}</p>
        <p
          className={`mt-1 text-[14px] leading-snug ${isEmpty ? "italic text-slate-400" : "font-medium text-[#001F3F]"}`}
          dir={dir}
        >
          {isEmpty ? emptyLabel : trimmed}
        </p>
      </div>
      <PersonalChangeLink onClick={onEdit} />
    </div>
  );
}

export function PersonalField({
  label,
  children,
  className = ""
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-right ${className}`}>
      <span className="mb-1 block text-[11px] font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export const personalInputClassName =
  "w-full rounded-xl border border-[#001F3F]/15 bg-[#FDFBF6]/70 px-3 py-2.5 text-sm text-[#001F3F] outline-none transition focus:border-[#001F3F]/40 focus:bg-white";

export const personalTextareaClassName = `${personalInputClassName} min-h-[6.5rem] resize-y leading-relaxed`;

export function PersonalCheckbox({
  checked,
  onChange,
  label,
  disabled = false
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-right text-sm text-[#001F3F]">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
      />
      <span>{label}</span>
    </label>
  );
}

export function PersonalEditModal({
  open,
  title,
  onClose,
  onSave,
  saving = false,
  error = null,
  children
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  saving?: boolean;
  error?: string | null;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, saving]);

  useEffect(() => {
    if (!open) return;

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverscroll = body.style.overscrollBehavior;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";

    const restoreScrollers: Array<() => void> = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      if (el.closest("[data-personal-edit-modal]")) continue;
      const overflowY = window.getComputedStyle(el).overflowY;
      if (overflowY !== "auto" && overflowY !== "scroll") continue;
      const previous = el.style.overflowY;
      el.style.overflowY = "hidden";
      restoreScrollers.push(() => {
        el.style.overflowY = previous;
      });
    }

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overscrollBehavior = prevBodyOverscroll;
      restoreScrollers.forEach((restore) => restore());
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      data-personal-edit-modal
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-hidden bg-black/40 px-4 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="personal-edit-modal-title"
      dir="rtl"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="mt-2 flex w-full max-w-md max-h-[min(85dvh,calc(100dvh-2.5rem))] flex-col overflow-y-auto overscroll-contain rounded-2xl border border-[#001F3F]/12 bg-white p-5 shadow-xl shadow-[#001F3F]/15 animate-in fade-in zoom-in-95 duration-200 sm:mt-0"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="personal-edit-modal-title" className="text-right text-base font-bold text-[#001F3F]">
          {title}
        </h2>
        <div className="mt-4 space-y-3">{children}</div>
        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="flex-1 rounded-xl border border-[#001F3F]/15 bg-white px-3 py-2.5 text-sm font-bold text-[#001F3F] transition hover:bg-[#FDFBF6] disabled:opacity-60"
          >
            ביטול
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave()}
            className="flex-[1.4] inline-flex items-center justify-center gap-2 rounded-xl bg-[#001F3F] px-3 py-2.5 text-sm font-bold text-white transition hover:bg-[#003366] disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "שומר…" : "שמירה"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function displayOrEmpty(value: unknown, empty = "לא הוגדר"): string {
  const trimmed = toDisplayString(value);
  return trimmed || empty;
}

export function formatDisplayDate(value: unknown): string {
  const raw = toDisplayString(value);
  if (!raw) return "";
  const parts = raw.slice(0, 10).split("-");
  if (parts.length !== 3) return raw;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function yesNoLabel(value: boolean | null | undefined): string {
  if (value === true) return "כן";
  if (value === false) return "לא";
  return "לא צוין";
}
