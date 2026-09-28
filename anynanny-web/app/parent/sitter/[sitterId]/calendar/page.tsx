import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ParentSitterAvailabilityView } from "@/components/parent/parent-sitter-availability-view";

export default async function ParentSitterCalendarPage({
  params
}: {
  params: Promise<{ sitterId: string }>;
}) {
  const { sitterId: rawSitterId } = await params;
  const sitterId = decodeURIComponent(rawSitterId);

  return (
    <main className="mx-auto w-full max-w-sm space-y-3 bg-[#FDFBF6] px-2 py-3 pb-24" dir="rtl">
      <div className="px-1">
        <Link
          href={`/parent/sitter/${encodeURIComponent(sitterId)}`}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-[#001F3F]"
        >
          <ArrowRight className="h-4 w-4" />
          חזרה לפרופיל
        </Link>
      </div>
      <ParentSitterAvailabilityView sitterId={sitterId} />
    </main>
  );
}
