"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Loader2 } from "lucide-react";
import { PERSONAL_AREA_EMPTY_SUMMARY } from "@/components/personal-area/personal-area-summaries";
import {
  AUTH_MODAL_CENTER_WRAP,
  AUTH_MODAL_OVERLAY_SCROLL
} from "@/lib/ui/auth-modal-overlay";

export function PersonalAreaSection({
  title,
  description,
  summary,
  accent = "navy",
  action,
  children,
  collapsible = true,
  defaultOpen = false,
  icon,
  headerAccessory,
  tone = "default"
}: {
  title: string;
  description?: string;
  summary?: string;
  accent?: "navy" | "gold" | "emerald" | "sky";
  action?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  icon?: ReactNode;
  headerAccessory?: ReactNode;
  tone?: "default" | "trust";
}) {
  const reactId = useId();
  const panelId = `${reactId}-panel`;
  const headerId = `${reactId}-header`;
  const [open, setOpen] = useState(defaultOpen);

  const accentClass =
    accent === "gold"
      ? "border-[#C5A059]/25"
      : accent === "emerald"
        ? "border-emerald-200/80"
        : accent === "sky"
          ? "border-sky-200/80"
          : "border-navy-header/10";

  const isTrust = tone === "trust";
  const cardToneClass = isTrust
    ? "border-[#C5A059]/55 bg-gradient-to-l from-[#FFF3D4] via-[#FFF8EA] to-[#FFFDF8] shadow-[0_1px_10px_rgba(197,160,89,0.16)]"
    : `bg-white shadow-soft ${accentClass}`;
  const titleWeightClass = isTrust ? "font-extrabold text-[#001F3F]" : "font-bold text-[#001F3F]";
  const collapsedSummary = (summary ?? "").trim() || PERSONAL_AREA_EMPTY_SUMMARY;
  const showCollapsedSummary = !headerAccessory;

  if (!collapsible) {
    return (
      <section className={`rounded-2xl border p-4 sm:p-5 ${cardToneClass}`} dir="rtl">
        <div className="mb-3 flex items-start justify-between gap-3 text-right">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-start gap-2">
                <h2 className={`text-[17px] ${titleWeightClass}`}>{title}</h2>
                {headerAccessory}
              </div>
              {description ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p> : null}
            </div>
          </div>
          {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
        </div>
        {children}
      </section>
    );
  }

  return (
    <section
      data-personal-area-accordion
      className={`min-w-0 w-full rounded-2xl border px-3.5 py-2.5 sm:px-5 sm:py-3 ${cardToneClass}`}
      dir="rtl"
    >
      <h2 className={`m-0 text-right text-[17px] ${titleWeightClass}`}>
        <button
          type="button"
          id={headerId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
          className={`flex min-h-[44px] w-full items-start gap-2.5 rounded-xl text-right outline-none transition focus-visible:ring-2 focus-visible:ring-[#001F3F]/25 focus-visible:ring-offset-2 ${
            isTrust ? "hover:bg-[#F5E4B8]/40" : "hover:bg-[#FDFBF6]/80"
          }`}
        >
          {icon ? <span className="mt-1.5 shrink-0">{icon}</span> : null}
          <span className="min-w-0 flex-1 py-1">
            <span className="flex flex-wrap items-center justify-start gap-2">
              <span className="leading-snug">{title}</span>
              {headerAccessory ? <span className="shrink-0">{headerAccessory}</span> : null}
            </span>
            {open ? (
              description ? (
                <span className="mt-1 block text-xs font-normal leading-relaxed text-slate-500">
                  {description}
                </span>
              ) : null
            ) : showCollapsedSummary ? (
              <span className="mt-0.5 block line-clamp-2 break-words text-xs font-normal leading-relaxed text-slate-500">
                {collapsedSummary}
              </span>
            ) : null}
          </span>
          <ChevronDown
            className={`mt-2 h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden
          />
        </button>
      </h2>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        aria-hidden={!open}
        inert={open ? undefined : true}
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-[#001F3F]/8 pt-3">
            {action ? <div className="mb-2 flex justify-end">{action}</div> : null}
            {children}
          </div>
        </div>
      </div>
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
      className="text-[14px] font-semibold text-[#0B6BCB] underline decoration-[#0B6BCB]/35 underline-offset-2 transition hover:text-[#08529a] hover:decoration-[#08529a] disabled:opacity-50"
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
  dir,
  actionLabel
}: {
  label: string;
  value?: unknown;
  emptyLabel?: string;
  onEdit: () => void;
  dir?: "ltr" | "rtl";
  actionLabel?: string;
}) {
  const trimmed = toDisplayString(value);
  const isEmpty = !trimmed;

  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#001F3F]/8 py-3 last:border-b-0">
      <div className="min-w-0 flex-1 text-right">
        <p className="text-[13px] font-semibold text-slate-500">{label}</p>
        <p
          className={`mt-1 text-[16px] leading-snug ${isEmpty ? "italic text-slate-400" : "font-medium text-[#001F3F]"}`}
          dir={dir}
        >
          {isEmpty ? emptyLabel : trimmed}
        </p>
      </div>
      <PersonalChangeLink onClick={onEdit} label={actionLabel ?? "שינוי"} />
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
      <span className="mb-1 block text-[13px] font-semibold text-slate-600">{label}</span>
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
  saveLabel = "שמירה",
  savingLabel = "שומר…",
  children
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  saving?: boolean;
  error?: string | null;
  saveLabel?: string;
  savingLabel?: string;
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
      className={`fixed inset-0 z-[120] ${AUTH_MODAL_OVERLAY_SCROLL} bg-black/40`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="personal-edit-modal-title"
      dir="rtl"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div className={AUTH_MODAL_CENTER_WRAP}>
      <div
        className="my-auto w-full max-w-md rounded-2xl border border-[#001F3F]/12 bg-white p-5 shadow-xl shadow-[#001F3F]/15 animate-in fade-in zoom-in-95 duration-200"
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
            {saving ? savingLabel : saveLabel}
          </button>
        </div>
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
