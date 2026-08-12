import { ParentDashboardClient } from "@/components/parent/parent-dashboard-client";
import type { BookingRow } from "@/lib/bookings/constants";
import type { NannyProfile } from "@/lib/ratings/types";
import type { ParentPreferences, ParentBusySlot } from "@/lib/parent/types";
import { fetchProfilePublicId } from "@/lib/public/sequential-display-id";
import { createServerClient } from "@/lib/supabase/server";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";
import {
  getSitterProfilesUserColumn,
  SITTER_PROFILES_TABLE
} from "@/lib/sitter/sitter-profile";
import { isPostgrestMissingColumnError, isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";
import {
  isBookingDueForParentActiveShiftUi,
  isFutureScheduledBooking
} from "@/lib/bookings/booking-shift-ui";

export const dynamic = "force-dynamic";

export default async function ParentDashboardPage() {
  const supabase = await createServerClient();
  if (!supabase) {
    return (
      <ParentDashboardClient
        initialProfiles={[]}
        initialPreferences={{
          parentName: "הורה",
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
        }}
        initialBusySlots={[]}
        initialActiveBooking={null}
        initialAvatarUrl={null}
      />
    );
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
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

  let activeBooking: BookingRow | null = null;
  let initialProfiles: NannyProfile[] = [];
  let initialAvatarUrl: string | null = null;

  if (parentId) {
    // Prefer lean selects first to avoid 400 spam when optional columns are absent.
    const profileSelectAttempts = [
      "first_name, last_name, address, avatar_url",
      "first_name, last_name, address",
      "first_name, last_name",
      "first_name, last_name, address, parent_serial",
      "first_name, last_name, address, parent_serial, parent_public_id"
    ];

    for (const select of profileSelectAttempts) {
      const { data: profileData, error } = await supabase
        .from(PROFILES_TABLE)
        .select(select)
        .eq("id", parentId)
        .maybeSingle();

      if (error) {
        if (
          isPostgrestMissingColumnError(error.message, "parent_serial") ||
          isPostgrestMissingColumnError(error.message, "parent_public_id") ||
          isPostgrestMissingColumnError(error.message, "address") ||
          isPostgrestMissingColumnError(error.message, "avatar_url") ||
          isPostgrestSchemaDriftError(error.message)
        ) {
          continue;
        }
        break;
      }

      if (profileData) {
        const row = profileData as unknown as Record<string, unknown>;
        const first = typeof row.first_name === "string" ? row.first_name : "";
        const last = typeof row.last_name === "string" ? row.last_name : "";
        if (first) {
          initialPreferences.parentName = `${first} ${last}`.trim();
        }
        const address = row.address;
        if (address && typeof address === "object" && address !== null && "city" in address) {
          initialPreferences.locationLabel =
            String((address as { city?: string }).city || "").trim() || "ישראל";
        }
        const avatar = typeof row.avatar_url === "string" ? row.avatar_url.trim() : "";
        if (avatar) initialAvatarUrl = avatar;
      }
      break;
    }

    const { publicId } = await fetchProfilePublicId(supabase, parentId, "parent");
    if (publicId) {
      initialPreferences.parentSerial = publicId;
    }

    const { data: bookingRows } = await supabase
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
      .order("updated_at", { ascending: false })
      .limit(8);

    const rows = (bookingRows as BookingRow[] | null) ?? [];
    // Prefer a due live shift; otherwise keep a future scheduled booking for confirmation UI.
    activeBooking =
      rows.find((b) => isBookingDueForParentActiveShiftUi(b)) ??
      rows.find((b) => isFutureScheduledBooking(b)) ??
      null;
  }

  // Sitters live on sitter_profiles — profiles.nanny_serial does not exist (404/400).
  const userCol = getSitterProfilesUserColumn();
  const sitterSelectAttempts = [
    `${userCol}, first_name, last_name, nanny_serial, hourly_rate_nis, years_experience, avg_rating`,
    `${userCol}, first_name, last_name, nanny_serial, hourly_rate_nis, years_experience`,
    `${userCol}, first_name, last_name, nanny_serial, hourly_rate_nis`,
    `${userCol}, first_name, last_name, nanny_serial`,
    `${userCol}, first_name, last_name`
  ];

  for (const select of sitterSelectAttempts) {
    const { data: rawNannies, error } = await supabase
      .from(SITTER_PROFILES_TABLE)
      .select(select)
      .eq("is_public", true)
      .limit(40);

    if (error) {
      if (
        isPostgrestMissingColumnError(error.message, "nanny_serial") ||
        isPostgrestMissingColumnError(error.message, "hourly_rate_nis") ||
        isPostgrestMissingColumnError(error.message, "years_experience") ||
        isPostgrestMissingColumnError(error.message, "avg_rating") ||
        isPostgrestSchemaDriftError(error.message)
      ) {
        continue;
      }
      break;
    }

    initialProfiles = (rawNannies || []).map((n, index) => {
      const row = n as unknown as Record<string, unknown>;
      const first = typeof row.first_name === "string" ? row.first_name : "";
      const last = typeof row.last_name === "string" ? row.last_name : "";
      const serial =
        typeof row.nanny_serial === "string" && row.nanny_serial.trim()
          ? row.nanny_serial.trim()
          : `AN-${1001 + index}`;
      const rate = Number(row.hourly_rate_nis);
      const years = Number(row.years_experience);
      const rating = Number(row.avg_rating);
      return {
        nannyName: `${first} ${last}`.trim() || `סיטר/ית ${index + 1}`,
        anyNannyId: serial,
        hourlyRateNis: Number.isFinite(rate) && rate > 0 ? rate : 50,
        gender: "female" as const,
        age: 24,
        experienceYears: Number.isFinite(years) && years >= 0 ? years : 2,
        reputationScore: Number.isFinite(rating) && rating > 0 ? rating : 4.8,
        totalRatings: 0
      };
    });
    break;
  }

  const initialBusySlots: ParentBusySlot[] = [];

  return (
    <ParentDashboardClient
      initialProfiles={initialProfiles}
      initialPreferences={initialPreferences}
      initialBusySlots={initialBusySlots}
      initialActiveBooking={activeBooking}
      initialAvatarUrl={initialAvatarUrl}
    />
  );
}