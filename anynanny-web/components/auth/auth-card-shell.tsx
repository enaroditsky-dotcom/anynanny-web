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
      <section className="w-full min-w-0 max-w-md rounded-3xl border border-[#001F3F]/10 bg-white p-6 shadow-soft">
        <div className="mb-4 flex justify-center">
          <AnyNannyLogo variant="header" />
        </div>
        <h1 className="text-center text-2xl font-bold text-navy-header">{title}</h1>
        {description ? (
          <p className="mt-2 text-center text-base leading-relaxed text-slate-600">{description}</p>
        ) : null}
        {children}
      </section>
    </main>
  );
}
