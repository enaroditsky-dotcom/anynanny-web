"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ChevronLeft,
  ChevronRight,
  LogOut
} from "lucide-react";
import type { ReactNode } from "react";

const APP_VERSION = "v0.1.0";

export function SettingsProfileHeader() {
  return (
    <header className="shrink-0 px-1 pb-5 pt-2 text-right">
      <h1 className="text-lg font-bold text-[#001F3F]">הגדרות</h1>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">ניהול חשבון, פרטיות והתראות</p>
    </header>
  );
}

export function SettingsNavRow({
  icon: Icon,
  title,
  description,
  onClick,
  tone = "default"
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick?: () => void;
  tone?: "default" | "danger";
}) {
  const titleClass =
    tone === "danger" ? "text-rose-700" : "text-[#001F3F]";
  const iconClass =
    tone === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-[#001F3F]/15 bg-white text-[#001F3F]";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-right transition active:bg-[#001F3F]/[0.03]"
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 shadow-[0_3px_10px_-4px_rgba(0,31,63,0.2)] ${iconClass}`}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-semibold leading-snug ${titleClass}`}>{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-slate-500">{description}</span>
      </span>
      <ChevronLeft className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
    </button>
  );
}

export function SettingsRowGroup({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#001F3F]/10 bg-white">
      <div className="divide-y divide-[#001F3F]/8">{children}</div>
    </div>
  );
}

export function SettingsSubPanel({
  title,
  onBack,
  children
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col animate-in fade-in slide-in-from-left-2 duration-200">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 flex shrink-0 items-center gap-1 px-1 text-sm font-semibold text-[#001F3F]"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
        <span>{title}</span>
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </div>
  );
}

export function SettingsSubRow({
  label,
  hint,
  trailing,
  onClick,
  tone = "default"
}: {
  label: string;
  hint?: string;
  trailing?: ReactNode;
  onClick?: () => void;
  tone?: "default" | "danger";
}) {
  const labelClass = tone === "danger" ? "text-rose-700" : "text-[#001F3F]";
  const body = (
    <>
      <span className="min-w-0 flex-1 text-right">
        <span className={`block text-sm font-semibold ${labelClass}`}>{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-slate-500">{hint}</span> : null}
      </span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
      {onClick && !trailing ? <ChevronLeft className="h-4 w-4 shrink-0 text-slate-400" aria-hidden /> : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-3.5 transition active:bg-[#001F3F]/[0.03]"
      >
        {body}
      </button>
    );
  }

  return <div className="flex items-center gap-3 px-4 py-3.5">{body}</div>;
}

export function RetroToggle({
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
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border-2 transition disabled:opacity-50 ${
        checked ? "border-[#001F3F] bg-[#001F3F]" : "border-[#001F3F]/30 bg-white"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${
          checked ? "left-0.5" : "right-0.5"
        }`}
      />
    </button>
  );
}

export function SettingsModalSheet({
  open,
  title,
  onClose,
  children
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 rounded-2xl border border-[#001F3F]/12 bg-white p-5 shadow-xl shadow-[#001F3F]/15 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="settings-modal-title" className="text-right text-base font-bold text-[#001F3F]">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function SettingsLogoutRow({ onLogout }: { onLogout: () => void }) {
  return (
    <SettingsRowGroup>
      <button
        type="button"
        onClick={onLogout}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-right transition active:bg-rose-50/80"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-rose-200 bg-rose-50 text-rose-700 shadow-[0_3px_10px_-4px_rgba(190,18,60,0.2)]">
          <LogOut className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-rose-700">יציאה</span>
          <span className="mt-0.5 block text-xs text-slate-500">התנתקות מהחשבון במכשיר זה</span>
        </span>
      </button>
    </SettingsRowGroup>
  );
}

export function SettingsLegalFooter() {
  return (
    <footer className="shrink-0 space-y-1.5 pt-3">
      <div className="flex items-center justify-between px-1 text-[11px] font-medium text-[#001F3F]/55">
        <span>מדיניות פרטיות</span>
        <Link href="/terms" className="transition hover:text-[#001F3F]">
          תנאי שימוש
        </Link>
      </div>
      <p className="text-center">
        <a
          href="https://www.anynanny.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-medium text-[#001F3F]/55 underline decoration-[#001F3F]/20 underline-offset-2 transition hover:text-[#001F3F]"
        >
          לאתר הבית: www.anynanny.org
        </a>
      </p>
      <p className="text-center text-[10px] text-slate-400">{APP_VERSION}</p>
    </footer>
  );
}

export function SettingsFaqAccordion({
  items,
  openId,
  onToggle
}: {
  items: { id: string; question: string; answer: string }[];
  openId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <SettingsRowGroup>
      {items.map((item) => {
        const open = openId === item.id;
        return (
          <div key={item.id}>
            <button
              type="button"
              onClick={() => onToggle(open ? "" : item.id)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-right transition active:bg-[#001F3F]/[0.03]"
              aria-expanded={open}
            >
              <span className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug text-[#001F3F]">
                {item.question}
              </span>
              <ChevronLeft
                className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "-rotate-90" : ""}`}
                aria-hidden
              />
            </button>
            {open ? (
              <p className="break-words border-t border-[#001F3F]/8 px-4 py-3 text-right text-xs leading-relaxed text-slate-600">
                {item.answer}
              </p>
            ) : null}
          </div>
        );
      })}
    </SettingsRowGroup>
  );
}
