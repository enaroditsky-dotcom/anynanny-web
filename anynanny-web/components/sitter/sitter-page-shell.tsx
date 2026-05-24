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
    <main className="mx-auto w-full max-w-md space-y-4 bg-[#FDFBF6] py-2 pb-24" dir="rtl">
      <div className="flex items-center justify-between gap-2 px-1">
        <Link
          href="/sitter/dashboard"
          className="inline-flex items-center gap-1 rounded-full border border-navy-header/20 bg-white px-3 py-1.5 text-xs font-semibold text-navy-header shadow-sm transition hover:bg-brand-cream"
        >
          <ArrowRight className="h-4 w-4" />
          דשבורד
        </Link>
        <h1 className="text-lg font-bold text-navy-header">{title}</h1>
      </div>
      {subtitle ? <p className="px-1 text-right text-sm text-slate-600">{subtitle}</p> : null}
      {children}
    </main>
  );
}
