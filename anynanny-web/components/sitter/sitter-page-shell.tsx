import type { ReactNode } from "react";
import { PageBackLink, PageBackRow } from "@/components/navigation/page-back-link";

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
      <div className="shrink-0 space-y-2 px-1">
        <PageBackRow>
          <PageBackLink href="/sitter/dashboard" />
        </PageBackRow>
        <h1 className="text-right text-lg font-bold text-navy-header">{title}</h1>
      </div>
      {subtitle ? <p className="shrink-0 px-1 text-right text-sm text-slate-600">{subtitle}</p> : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">{children}</div>
    </main>
  );
}
