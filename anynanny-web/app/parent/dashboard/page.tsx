import { ParentDashboardClient } from "@/components/parent/parent-dashboard-client";
import type { BookingRow } from "@/lib/bookings/constants";
import type { NannyProfile } from "@/lib/ratings/types";
import type { ParentPreferences, ParentBusySlot } from "@/lib/parent/types";
import { fetchProfilePublicId } from "@/lib/public/sequential-display-id";
import { createServerClient } from "@/lib/supabase/server";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";
import { listPublicSittersForDashboard } from "@/lib/sitter/parent-sitter-search";
import { resolveSitterCardTitle } from "@/lib/sitter/public-search-card";
import { isPostgrestMissingColumnError, isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";
import {
  isBookingDueForParentActiveShiftUi,
  isFutureConfirmedScheduleBooking,
  isFutureScheduledBooking
} from "@/lib/bookings/booking-shift-ui";
import { shouldShowApprovedScheduleNotification } from "@/lib/bookings/dismissed-approved-bookings";
import {
  fetchMissedShiftLifecycleBookings,
  pickActionableMissedShiftBooking,
  reconcileUnstartedPastBookings
} from "@/lib/bookings/missed-shift-client";

export const dynamic = "force-dynamic";

export default async function ParentDashboardPage() {
  const supabase = await createServerClient();
  if (!supabase) {
    return (
      <ParentDashboardClient
        initialProfiles={[]}
        initialPreferences={{
          parentName: "הורה",
          parentSerial: "",
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
    parentSerial: "",
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

    await reconcileUnstartedPastBookings(supabase);

    const bookingSelectAttempts = [
      "id, parent_id, sitter_id, status, booking_date, start_time, end_time, parent_notified_at, created_at, updated_at",
      "id, parent_id, sitter_id, status, booking_date, start_time, end_time, created_at, updated_at"
    ];

    let rows: BookingRow[] = [];
    for (const select of bookingSelectAttempts) {
      const { data: bookingRows, error } = await supabase
        .from("bookings")
        .select(select)
        .eq("parent_id", parentId)
        .in("status", [
          "pending",
          "approved",
          "sitter_started",
          "parent_started",
          "sitter_ended",
          "awaiting_missed_shift_reason",
          "did_not_occur",
          "happened_unverified",
          "missed_shift_disputed"
        ])
        .order("updated_at", { ascending: false })
        .limit(8);

      if (error) {
        if (
          isPostgrestMissingColumnError(error.message, "parent_notified_at") ||
          isPostgrestSchemaDriftError(error.message)
        ) {
          continue;
        }
        break;
      }

      rows = ((bookingRows as unknown) as BookingRow[] | null) ?? [];
      break;
    }

    const missedRows = await fetchMissedShiftLifecycleBookings(supabase, parentId, "parent");
    const actionableMissed = pickActionableMissedShiftBooking(missedRows, "parent");

    // Prefer a missed-shift that still needs this parent's reason, then a due live shift.
    activeBooking =
      actionableMissed ??
      rows.find((b) => isBookingDueForParentActiveShiftUi(b)) ??
      rows.find((b) => shouldShowApprovedScheduleNotification(b)) ??
      rows.find(
        (b) => isFutureScheduledBooking(b) && !isFutureConfirmedScheduleBooking(b)
      ) ??
      null;
  }

  const publicSitters = await listPublicSittersForDashboard(supabase);
  initialProfiles = publicSitters.slice(0, 40).map((card, index) => {
    const rate = Number(card.hourly_rate_nis);
    const years = Number(card.years_experience);
    const rating = Number(card.avg_rating);
    return {
      nannyName: resolveSitterCardTitle(card) || `סיטר/ית ${index + 1}`,
      anyNannyId: card.nanny_serial?.trim() || `AN-${1001 + index}`,
      hourlyRateNis: Number.isFinite(rate) && rate > 0 ? rate : 50,
      gender: "female" as const,
      age: 24,
      experienceYears: Number.isFinite(years) && years >= 0 ? years : 2,
      reputationScore: Number.isFinite(rating) && rating > 0 ? rating : 4.8,
      totalRatings: card.rating_count ?? 0
    };
  });

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