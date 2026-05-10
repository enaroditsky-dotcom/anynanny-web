import Link from "next/link";

/** Shown when a logged-in parent reaches sitter-only UI (middleware + client fallback). */
export function ParentSitterAccessNotice() {
  return (
    <main className="mx-auto w-full max-w-md space-y-6 bg-[#FDFBF6] px-4 py-10" dir="rtl">
      <div className="space-y-5">
        <p className="text-right text-base font-semibold leading-relaxed text-[#001F3F]">
          אופס! נראה שאתה רשום כהורה. כדי לגשת לכאן צריך להיות רשום כבייביסיטר.
        </p>
        <div className="flex w-full justify-end">
          <Link
            href="/auth/register?role=sitter"
            className="inline-flex max-w-full rounded-2xl bg-[#001F3F] px-5 py-3 text-right text-sm font-bold text-white shadow-soft transition hover:brightness-105 active:brightness-95"
          >
            האם ברצונך להירשם כבייביסיטר?
          </Link>
        </div>
      </div>
    </main>
  );
}
