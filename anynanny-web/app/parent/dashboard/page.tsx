import { ParentDashboardClient } from "@/components/parent/parent-dashboard-client";
import { loadParentDashboardData } from "@/lib/parent/load-dashboard-data";

export default async function ParentDashboardPage() {
  const { profiles, preferences, busySlots } = await loadParentDashboardData();

  return (
    <ParentDashboardClient
      initialProfiles={profiles}
      initialPreferences={preferences}
      initialBusySlots={busySlots}
    />
  );
}
