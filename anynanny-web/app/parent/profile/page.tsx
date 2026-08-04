import Link from "next/link";
import { ParentPersonalArea } from "@/components/parent/parent-personal-area";

export default function ParentProfilePage() {
  return (
    <main
      className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-md flex-col bg-[#FDFBF6] px-1 py-2 pb-8"
      dir="rtl"
    >
      <header className="mb-4 flex items-center justify-between gap-3 px-1">
        <Link
          href="/parent/dashboard"
          className="rounded-full border border-navy-header/20 bg-white px-3 py-1.5 text-xs font-semibold text-navy-header shadow-sm transition hover:bg-white/80"
        >
          חזרה לדשבורד
        </Link>
        <div className="text-right">
          <h1 className="text-lg font-bold text-[#001F3F]">אזור אישי</h1>
          <p className="text-xs text-slate-500">פרטי המשפחה מהשאלון</p>
        </div>
      </header>

      <ParentPersonalArea />
    </main>
  );
}
