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
      className="mx-auto flex w-full min-w-0 max-w-md flex-col space-y-4 bg-[#FDFBF6] py-2"
      dir="rtl"
    >
      <div className="space-y-2 px-1">
        <PageBackRow>
          <PageBackLink href="/sitter/dashboard" />
        </PageBackRow>
        <h1 className="text-right text-lg font-bold text-navy-header">{title}</h1>
      </div>
      {subtitle ? <p className="px-1 text-right text-sm text-slate-600">{subtitle}</p> : null}
      <div className="flex flex-col">{children}</div>
    </main>
  );
}
