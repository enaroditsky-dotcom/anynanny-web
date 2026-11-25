"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { RATINGS_TABLE } from "@/lib/ratings/constants";
import { SITTER_PROFILES_TABLE, SITTER_PROFILES_USER_COLUMN } from "@/lib/sitter/sitter-profile";
import {
  countPublishedWrittenReviews,
  evaluateSitterBoostProgress,
  SITTER_BOOST_AVAILABILITY_TABLE,
  upcomingScheduleBounds,
  type SitterBoostProgress
} from "@/lib/sitter/profile-boost-progress";

const PROFILE_COLUMNS = [
  "avatar_url",
  "first_name",
  "last_name",
  "birth_date",
  "address_full",
  "home_city",
  "id_number",
  "bio",
  "years_experience",
  "years_experience_band",
  "experience_age_groups",
  "languages",
  "certifications",
  "preferred_ages",
  "preferred_child_age_groups",
  "task_capabilities",
  "work_type_preferences",
  "additional_service_interests",
  "homework_help",
  "has_car",
  "has_first_aid_training",
  "has_childcare_training",
  "has_special_needs_experience",
  "has_drivers_license",
  "max_children",
  "desired_hours_per_week"
].join(", ");

export type SitterBoostProgressStatus = "idle" | "loading" | "ready" | "error";

const EMPTY: SitterBoostProgress = {
  checkpoints: Array.from({ length: 8 }, () => "unknown"),
  completed: 0,
  total: 8,
  percent: 0
};

export function useSitterProfileBoostProgress(sitterId: string | null) {
  const [status, setStatus] = useState<SitterBoostProgressStatus>(sitterId ? "loading" : "idle");
  const [progress, setProgress] = useState<SitterBoostProgress>(EMPTY);

  useEffect(() => {
    if (!sitterId) {
      setStatus("idle");
      setProgress(EMPTY);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus("error");
      setProgress(EMPTY);
      return;
    }

    let cancelled = false;
    setStatus("loading");
    const now = new Date();
    const bounds = upcomingScheduleBounds(now);

    void (async () => {
      const [profileResult, accountResult, availabilityResult, ratingsResult] = await Promise.all([
        supabase
          .from(SITTER_PROFILES_TABLE)
          .select(PROFILE_COLUMNS)
          .eq(SITTER_PROFILES_USER_COLUMN, sitterId)
          .maybeSingle(),
        supabase.from("profiles").select("avatar_url").eq("id", sitterId).maybeSingle(),
        supabase
          .from(SITTER_BOOST_AVAILABILITY_TABLE)
          .select("availability_date")
          .eq("sitter_id", sitterId)
          .gte("availability_date", bounds.start)
          .lte("availability_date", bounds.end),
        supabase
          .from(RATINGS_TABLE)
          .select("comment, published_at")
          .eq("to_user_id", sitterId)
          .not("published_at", "is", null)
      ]);

      if (cancelled) return;

      const profileRow = profileResult.data as Record<string, unknown> | null;
      const accountRow = accountResult.data as { avatar_url?: string | null } | null;
      const next = evaluateSitterBoostProgress({
        profile: profileResult.error
          ? null
          : {
              profileAvatarUrl: stringOrNull(profileRow?.avatar_url),
              accountAvatarUrl: stringOrNull(accountRow?.avatar_url),
              firstName: stringOrNull(profileRow?.first_name),
              lastName: stringOrNull(profileRow?.last_name),
              birthDate: stringOrNull(profileRow?.birth_date),
              addressFull: stringOrNull(profileRow?.address_full),
              homeCity: stringOrNull(profileRow?.home_city),
              idNumber: stringOrNull(profileRow?.id_number),
              bio: stringOrNull(profileRow?.bio),
              yearsExperience: numberOrNull(profileRow?.years_experience),
              yearsExperienceBand: stringOrNull(profileRow?.years_experience_band),
              experienceAgeGroups: listOrNull(profileRow?.experience_age_groups),
              languages: listOrNull(profileRow?.languages),
              certifications: stringOrNull(profileRow?.certifications),
              preferredAges: stringOrNull(profileRow?.preferred_ages),
              preferredChildAgeGroups: listOrNull(profileRow?.preferred_child_age_groups),
              taskCapabilities: listOrNull(profileRow?.task_capabilities),
              workTypePreferences: listOrNull(profileRow?.work_type_preferences),
              additionalServiceInterests: listOrNull(profileRow?.additional_service_interests),
              homeworkHelp: profileRow?.homework_help === true,
              hasCar: profileRow?.has_car === true,
              hasFirstAidTraining: profileRow?.has_first_aid_training === true,
              hasChildcareTraining: profileRow?.has_childcare_training === true,
              hasSpecialNeedsExperience: profileRow?.has_special_needs_experience === true,
              hasDriversLicense: profileRow?.has_drivers_license === true,
              maxChildren: numberOrNull(profileRow?.max_children),
              desiredHoursPerWeek: numberOrNull(profileRow?.desired_hours_per_week)
            },
        savedAvailabilityDates: availabilityResult.error
          ? null
          : (availabilityResult.data ?? []).map((row) => String((row as { availability_date?: string }).availability_date ?? "")),
        publishedRatingCount: ratingsResult.error ? null : (ratingsResult.data ?? []).length,
        publishedWrittenReviewCount: ratingsResult.error
          ? null
          : countPublishedWrittenReviews(
              (ratingsResult.data ?? []) as { comment?: string | null; published_at?: string | null }[]
            ),
        now
      });

      setProgress(next);
      setStatus(profileResult.error && ratingsResult.error && availabilityResult.error ? "error" : "ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [sitterId]);

  return { status, progress };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : value == null ? null : String(value);
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function listOrNull(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}
