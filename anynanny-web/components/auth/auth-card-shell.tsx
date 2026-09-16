import type { ReactNode } from "react";
import { AnyNannyLogo } from "@/components/brand/anynanny-logo";

export function AuthCardShell({
  title,
  description,
  children
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <main
      className="mx-auto flex min-h-[100dvh] w-full min-w-0 max-w-full flex-col items-center justify-center bg-[#FDFBF6] px-4 py-6"
      dir="rtl"
    >
      <section className="w-full min-w-0 max-w-md rounded-2xl border border-[#001F3F]/10 bg-white p-4 shadow-soft">
        <div className="mb-3 flex justify-center">
          <AnyNannyLogo variant="header" />
        </div>
        <h1 className="text-center text-xl font-bold text-navy-header">{title}</h1>
        {description ? (
          <p className="mt-1.5 text-center text-sm leading-relaxed text-slate-600">{description}</p>
        ) : null}
        {children}
      </section>
    </main>
  );
}
