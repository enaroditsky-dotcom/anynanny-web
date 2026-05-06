import { ParentDashboardClient } from "@/components/parent/parent-dashboard-client";
import { getParentPreferences, listBusySlotsForParent } from "@/lib/parent/service";
import { getNannyProfiles } from "@/lib/ratings/service";

export default async function ParentDashboardPage() {
  const parentName = "הורה";
  const [profiles, preferences, busySlots] = await Promise.all([
    getNannyProfiles(),
    getParentPreferences(parentName),
    listBusySlotsForParent(parentName)
  ]);

  return (
    <ParentDashboardClient initialProfiles={profiles} initialPreferences={preferences} initialBusySlots={busySlots} />
  );
}
