import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ParentDashboardClient } from "@/components/parent/parent-dashboard-client";
import type { NannyProfile } from "@/lib/ratings/types";
import type { ParentPreferences, ParentBusySlot } from "@/lib/parent/types";

export const dynamic = "force-dynamic";

export default async function ParentDashboardPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
  
  const { data: { user } } = await supabase.auth.getUser();
  const parentId = user?.id ?? null;

  let initialPreferences: ParentPreferences & { parentSerial?: string } = {
    parentName: user?.email?.split("@")[0] || "הורה",
    parentSerial: "P-1001",
    favoriteSitterId: "",
    locationLabel: "ישראל",
    minRate: 30,
    maxRate: 150,
    preferredGender: "all",
    transportMode: "taxi",
    minAge: 18,
    minExperienceYears: 0,
    minRating: 0,
    reassurancePingEnabled: true,
    calendarSyncGoogle: false,
    calendarSyncPhone: false
  };

  let activeBooking: any = null;

  if (parentId) {
    // שליפת פרופיל ההורה (כולל parent_serial אם קיים בטבלה, או מטבלת parent_profiles)
    const { data: profileData } = await supabase
      .from("profiles")
      .select("first_name, last_name, address, parent_serial")
      .eq("id", parentId)
      .maybeSingle();

    if (profileData) {
      if (profileData.first_name) {
        initialPreferences.parentName = `${profileData.first_name} ${profileData.last_name || ""}`.trim();
      }
      if (profileData.address && typeof profileData.address === "object" && "city" in profileData.address) {
        initialPreferences.locationLabel = (profileData.address as { city?: string }).city || "ישראל";
      }
      if (profileData.parent_serial) {
        initialPreferences.parentSerial = profileData.parent_serial;
      }
    } else {
      // גיבוי לשליפה מטבלת parent_profiles אם קייימת נפרד
      const { data: parentProfileExtra } = await supabase
        .from("parent_profiles")
        .select("parent_serial")
        .eq("id", parentId)
        .maybeSingle();
      
      if (parentProfileExtra?.parent_serial) {
        initialPreferences.parentSerial = parentProfileExtra.parent_serial;
      }
    }

    // שליפת המשמרת הפעילה / ממתינה לאישור הגעה / בזמן ריצה
    const { data: bookingData } = await supabase
      .from("bookings")
      .select("id, parent_id, sitter_id, status, booking_date, start_time, end_time, created_at, updated_at")
      .eq("parent_id", parentId)
      .in("status", [
        "pending",
        "approved",
        "sitter_started",
        "parent_started",
        "sitter_ended"
      ])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bookingData) {
      activeBooking = bookingData;
    }
  }

  const { data: rawNannies } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, role, nanny_serial")
    .eq("role", "sitter");

  const initialProfiles: NannyProfile[] = (rawNannies || []).map((n, index) => ({
    nannyName: `${n.first_name || ""} ${n.last_name || ""}`.trim() || `סיטר/ית ${index + 1}`,
    anyNannyId: n.nanny_serial || `AN-${1001 + index}`,
    hourlyRateNis: 50,
    gender: "female",
    age: 24,
    experienceYears: 2,
    reputationScore: 4.8
  }));

  const initialBusySlots: ParentBusySlot[] = [];

  return (
    <ParentDashboardClient
      initialProfiles={initialProfiles}
      initialPreferences={initialPreferences}
      initialBusySlots={initialBusySlots}
      initialActiveBooking={activeBooking}
    />
  );
}