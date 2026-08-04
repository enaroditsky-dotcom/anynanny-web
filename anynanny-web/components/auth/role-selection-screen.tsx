"use client";

import { Baby, Loader2, Users } from "lucide-react";
import type { ProfileRole } from "@/lib/supabase/profiles";

type RoleSelectionScreenProps = {
  busy: ProfileRole | null;
  message: string;
  onChoose: (role: ProfileRole) => void;
};

export function RoleSelectionScreen({ busy, message, onChoose }: RoleSelectionScreenProps) {
  return (
    <main
      className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col justify-center px-4 py-10"
      dir="rtl"
    >
      <div className="text-center">
        <p className="text-sm font-medium text-emerald-800/90">ברוכים הבאים ל-AnyNanny</p>
        <h1 className="mt-2 text-2xl font-bold leading-snug text-[#001F3F] sm:text-3xl">נעים להכיר! מי אתם?</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">בחרו את התפקיד שלכם כדי להמשיך. אפשר לשנות זאת רק בהמשך דרך התמיכה.</p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => onChoose("parent")}
          className="group flex min-h-[11rem] flex-col items-center justify-between rounded-3xl border-2 border-navy-header/12 bg-white p-5 text-center shadow-soft transition hover:border-[#001F3F]/35 hover:shadow-md active:scale-[0.99] disabled:opacity-60"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-800 ring-1 ring-sky-200/80 transition group-hover:bg-sky-100">
            {busy === "parent" ? (
              <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
            ) : (
              <Users className="h-7 w-7 stroke-[1.75]" aria-hidden />
            )}
          </span>
          <span className="w-full space-y-1">
            <span className="block text-lg font-bold text-[#001F3F]">אני הורה</span>
            <span className="block text-xs leading-snug text-slate-600">מחפש/ת בייביסיטר</span>
          </span>
        </button>

        <button
          type="button"
          disabled={busy !== null}
          onClick={() => onChoose("sitter")}
          className="group flex min-h-[11rem] flex-col items-center justify-between rounded-3xl border-2 border-emerald-600/25 bg-gradient-to-b from-emerald-50/90 to-white p-5 text-center shadow-soft transition hover:border-emerald-600/45 hover:shadow-md active:scale-[0.99] disabled:opacity-60"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/90 transition group-hover:bg-emerald-200/80">
            {busy === "sitter" ? (
              <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
            ) : (
              <Baby className="h-7 w-7 stroke-[1.75]" aria-hidden />
            )}
          </span>
          <span className="w-full space-y-1">
            <span className="block text-lg font-bold text-emerald-950">אני בייביסיטר / נני</span>
            <span className="block text-xs leading-snug text-emerald-900/80">מחפש/ת עבודה</span>
          </span>
        </button>
      </div>

      {message ? (
        <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-center text-sm text-rose-900">
          {message}
        </p>
      ) : null}
    </main>
  );
}
