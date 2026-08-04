"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  EXPERT_SERVICE_OPTIONS,
  EXPERT_SERVICE_VISUALS,
  ExpertServiceOptionRow,
  type ExpertServiceKind
} from "@/components/sitter/expert-service-icons";

type ExpertServiceSelectProps = {
  value: ExpertServiceKind;
  onChange: (next: ExpertServiceKind) => void;
  label?: string;
  className?: string;
  /** Limit options (e.g. expert-only kinds without babysitter). */
  kinds?: ExpertServiceKind[];
};

/** Accessible custom dropdown with expert icons (native <select> cannot render icons). */
export function ExpertServiceSelect({
  value,
  onChange,
  label = "סוג המומחית",
  className = "",
  kinds
}: ExpertServiceSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const options = kinds?.length ? kinds : EXPERT_SERVICE_OPTIONS;
  const selected = EXPERT_SERVICE_VISUALS[value];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative text-right ${className}`} dir="rtl">
      {label ? <p className="mb-1.5 text-xs font-bold text-slate-500">{label}</p> : null}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition hover:border-slate-300"
      >
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
        <ExpertServiceOptionRow kind={value} selected />
      </button>

      {open ? (
        <ul
          role="listbox"
          aria-label={label}
          className="absolute inset-x-0 z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {options.map((kind) => {
            const active = kind === value;
            return (
              <li key={kind} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={`flex w-full items-center px-3 py-2.5 transition hover:bg-slate-50 ${
                    active ? selected.selectedClass.replace(/border-\S+/g, "").trim() : "text-slate-700"
                  }`}
                  onClick={() => {
                    onChange(kind);
                    setOpen(false);
                  }}
                >
                  <ExpertServiceOptionRow kind={kind} selected={active} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
