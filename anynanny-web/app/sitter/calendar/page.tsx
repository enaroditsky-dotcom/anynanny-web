import { AvailabilityCalendar } from "@/components/calendar/availability-calendar";

export default async function SitterCalendarPage({
  searchParams
}: {
  searchParams: Promise<{ sitterId?: string }>;
}) {
  const query = await searchParams;
  const sitterId = query.sitterId?.trim() || "demo-sitter-1";

  return (
    <main className="min-h-screen bg-surface p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-navy-900">Availability calendar</h1>
          <p className="mt-2 text-sm text-navy-700">
            Open the monthly grid, pick a day, then drag across slots to paint when you&apos;re available. Save changes before leaving the day view.
          </p>
          <p className="mt-1 text-xs text-navy-600">
            Sitter ID: <span className="font-mono">{sitterId}</span> (use query{" "}
            <span className="font-mono">?sitterId=your-id</span> for multi-account demos.)
          </p>
        </div>

        <AvailabilityCalendar mode="sitter" sitterId={sitterId} />
      </div>
    </main>
  );
}
