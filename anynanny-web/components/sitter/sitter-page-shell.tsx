import type { ReactNode } from "react";
import { PageBackLink, PageBackRow } from "@/components/navigation/page-back-link";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /**
   * Shift board: title stays put and the page fills the app-shell viewport
   * so the schedule can scroll in its own region.
   */
  board?: boolean;
};

export function SitterPageShell({ title, subtitle, children, board = false }: Props) {
  if (board) {
    return (
      <main
        id="sitter-shift-board-page"
        className="mx-auto flex w-full min-w-0 max-w-md flex-col overflow-x-hidden bg-[#FDFBF6]"
        dir="rtl"
      >
        <div className="shrink-0 space-y-1 px-1 pb-2 pt-1">
          <PageBackRow>
            <PageBackLink href="/sitter/dashboard" />
          </PageBackRow>
          <h1 className="text-right text-lg font-bold leading-tight text-navy-header">{title}</h1>
        </div>
        <div data-shift-board-body="" className="flex min-h-0 w-full flex-auto flex-col overflow-hidden px-1">
          {children}
        </div>
      </main>
    );
  }

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
