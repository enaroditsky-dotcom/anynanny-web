import Link from "next/link";
import { AvailabilityCalendar } from "@/components/calendar/availability-calendar";

export default async function SitterCalendarPage({
  searchParams
}: {
  searchParams: Promise<{ sitterId?: string }>;
}) {
  const query = await searchParams;
  const sitterId = query.sitterId?.trim() || "demo-sitter-1";

  return (
    <main className="min-h-screen bg-surface p-6 md:p-10" dir="rtl">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="rounded-2xl bg-white p-4 shadow-soft">
          <h1 className="text-2xl font-semibold text-navy-900">אזור אישי — יומן זמינות</h1>
          <p className="mt-1 text-sm text-navy-700">ניהול יומן, ארנק וסטטיסטיקות נמצא באזור האישי בלבד.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Link href="/sitter/personal" className="rounded-lg border border-navy-300 px-3 py-1 text-navy-900">מסך בית אישי</Link>
            <Link href="/sitter/session" className="rounded-lg border border-navy-300 px-3 py-1 text-navy-900">סשן פעיל</Link>
          </div>
          <p className="mt-2 text-xs text-navy-600">מזהה סיטר: <span className="font-mono">{sitterId}</span></p>
        </div>
        <AvailabilityCalendar mode="sitter" sitterId={sitterId} />
      </div>
    </main>
  );
}
