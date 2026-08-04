"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function SitterPageShell({ title, subtitle, children }: Props) {
  return (
    <main
      className="mx-auto flex h-full min-h-0 w-full max-w-md flex-col space-y-4 overflow-hidden bg-[#FDFBF6] py-2"
      dir="rtl"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-1">
        <Link
          href="/sitter/dashboard"
          className="inline-flex items-center gap-1 rounded-full border border-navy-header/20 bg-white px-3 py-1.5 text-xs font-semibold text-navy-header shadow-sm transition hover:bg-brand-cream"
        >
          <ArrowRight className="h-4 w-4" />
          דשבורד
        </Link>
        <h1 className="text-lg font-bold text-navy-header">{title}</h1>
      </div>
      {subtitle ? <p className="shrink-0 px-1 text-right text-sm text-slate-600">{subtitle}</p> : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">{children}</div>
    </main>
  );
}
