"use client";

import type { LucideIcon } from "lucide-react";
import { Baby, Droplet, MoonStar } from "lucide-react";
import type { ReactNode, SVGProps } from "react";
import type { ParentSearchServiceType } from "@/lib/sitter/parent-search-filters";

export type ExpertServiceKind = ParentSearchServiceType | "doula";

export type ExpertServiceVisual = {
  id: ExpertServiceKind;
  /** Short UI / URL alias */
  alias: string;
  labelHe: string;
  accentClass: string;
  selectedClass: string;
  iconClass: string;
  Icon: LucideIcon | ((props: SVGProps<SVGSVGElement>) => ReactNode);
};

/** Custom doula mark — pregnant silhouette / umbilical motif. */
export function DoulaIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
      {...props}
    >
      <path
        d="M12 3.2c1.5 0 2.7 1.2 2.7 2.7S13.5 8.6 12 8.6 9.3 7.4 9.3 5.9 10.5 3.2 12 3.2Z"
        fill="currentColor"
        opacity="0.95"
      />
      <path
        d="M8.2 10.2c1.1-.7 2.4-1.1 3.8-1.1s2.7.4 3.8 1.1c1.3.8 2.1 2.2 2.1 3.7v1.2c0 1.6-1 3-2.5 3.6l-1.1.4c-.7.3-1.5.4-2.3.4s-1.6-.1-2.3-.4l-1.1-.4C7.1 18.1 6.1 16.7 6.1 15.1v-1.2c0-1.5.8-2.9 2.1-3.7Z"
        fill="currentColor"
        opacity="0.88"
      />
      <path
        d="M12.1 12.4c.9.2 1.5 1 1.5 1.9 0 .7-.4 1.3-.9 1.6"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle cx="12.8" cy="14.2" r="1.15" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

export const EXPERT_SERVICE_VISUALS: Record<ExpertServiceKind, ExpertServiceVisual> = {
  babysitter: {
    id: "babysitter",
    alias: "sitter",
    labelHe: "בייביסיטר",
    accentClass: "bg-[#FF8A8A]/10 text-[#C45C5C] ring-[#FF8A8A]/35",
    selectedClass:
      "border-[#FF8A8A] bg-[#FF8A8A]/10 text-[#FF8A8A] font-bold shadow-sm ring-1 ring-[#FF8A8A]/30",
    iconClass: "text-[#FF8A8A]",
    Icon: Baby
  },
  lactation_consultant: {
    id: "lactation_consultant",
    alias: "lactation",
    labelHe: "יועצת הנקה",
    accentClass: "bg-emerald-50 text-emerald-800 ring-emerald-200/80",
    selectedClass:
      "border-emerald-500 bg-emerald-50 text-emerald-800 font-bold shadow-sm ring-1 ring-emerald-500/30",
    iconClass: "text-emerald-600",
    Icon: Droplet
  },
  sleep_consultant: {
    id: "sleep_consultant",
    alias: "sleep",
    labelHe: "יועצת שינה",
    accentClass: "bg-indigo-50 text-indigo-900 ring-indigo-200/80",
    selectedClass:
      "border-indigo-500 bg-indigo-50 text-indigo-900 font-bold shadow-sm ring-1 ring-indigo-500/30",
    iconClass: "text-indigo-600",
    Icon: MoonStar
  },
  doula: {
    id: "doula",
    alias: "doula",
    labelHe: "דולה",
    accentClass: "bg-rose-50 text-rose-800 ring-rose-200/80",
    selectedClass:
      "border-rose-400 bg-rose-50 text-rose-800 font-bold shadow-sm ring-1 ring-rose-400/30",
    iconClass: "text-rose-500",
    Icon: DoulaIcon
  }
};

export const EXPERT_SERVICE_OPTIONS: ExpertServiceKind[] = [
  "babysitter",
  "lactation_consultant",
  "sleep_consultant",
  "doula"
];

export function resolveExpertServiceKind(raw: string | null | undefined): ExpertServiceKind {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "doula") return "doula";
  if (value === "sleep" || value === "sleep_consultant") return "sleep_consultant";
  if (value === "lactation" || value === "lactation_consultant") return "lactation_consultant";
  return "babysitter";
}

export function expertServiceLabel(kind: ExpertServiceKind): string {
  return EXPERT_SERVICE_VISUALS[kind].labelHe;
}

export function ExpertServiceIcon({
  kind,
  className = "h-5 w-5"
}: {
  kind: ExpertServiceKind;
  className?: string;
}) {
  const visual = EXPERT_SERVICE_VISUALS[kind];
  const Icon = visual.Icon;
  return <Icon className={`${className} ${visual.iconClass}`} aria-hidden />;
}

/** Compact badge used on search / profile cards. */
export function ExpertServiceBadge({
  kind,
  className = ""
}: {
  kind: ExpertServiceKind;
  className?: string;
}) {
  const visual = EXPERT_SERVICE_VISUALS[kind];
  const Icon = visual.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${visual.accentClass} ${className}`}
      dir="rtl"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {visual.labelHe}
    </span>
  );
}

/** Option row for custom dropdown menus. */
export function ExpertServiceOptionRow({
  kind,
  selected = false
}: {
  kind: ExpertServiceKind;
  selected?: boolean;
}) {
  const visual = EXPERT_SERVICE_VISUALS[kind];
  const Icon = visual.Icon;
  return (
    <span className="flex w-full items-center justify-end gap-2 text-right" dir="rtl">
      <span className={`text-sm ${selected ? "font-bold" : "font-semibold"}`}>{visual.labelHe}</span>
      <Icon className={`h-4 w-4 shrink-0 ${visual.iconClass}`} aria-hidden />
    </span>
  );
}
