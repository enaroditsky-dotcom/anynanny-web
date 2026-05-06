import { AvailabilityCalendar } from "@/components/calendar/availability-calendar";

export default async function ParentSitterCalendarPage({
  params,
  searchParams
}: {
  params: Promise<{ sitterId: string }>;
  searchParams: Promise<{ parentName?: string }>;
}) {
  const { sitterId } = await params;
  const query = await searchParams;
  const parentName = query.parentName?.trim() || "Guest Parent";

  return (
    <main className="min-h-screen bg-surface p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-navy-900">Book this sitter</h1>
          <p className="mt-2 text-sm text-navy-700">
            Gray slots are in the past, green slots are available, red slots are already booked. Tap an available slot to confirm a booking.
          </p>
          <p className="mt-1 text-xs text-navy-600">
            Booking as <span className="font-medium">{parentName}</span> · Pass{" "}
            <span className="font-mono">?parentName=...</span> to personalize.
          </p>
        </div>

        <AvailabilityCalendar mode="parent" sitterId={decodeURIComponent(sitterId)} parentName={parentName} />
      </div>
    </main>
  );
}
