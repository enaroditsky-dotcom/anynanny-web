import { PageBackLink, PageBackRow } from "@/components/navigation/page-back-link";
import { ParentPersonalArea } from "@/components/parent/parent-personal-area";

export default function ParentProfilePage() {
  return (
    <main
      className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-md flex-col bg-[#FDFBF6] px-1 py-2 pb-8"
      dir="rtl"
    >
      <header className="mb-4 space-y-2 px-1">
        <PageBackRow>
          <PageBackLink href="/parent/dashboard" />
        </PageBackRow>
        <div className="text-right">
          <h1 className="text-lg font-bold text-[#001F3F]">אזור אישי</h1>
          <p className="text-xs text-slate-500">פרטי המשפחה מהשאלון</p>
        </div>
      </header>

      <ParentPersonalArea />
    </main>
  );
}
