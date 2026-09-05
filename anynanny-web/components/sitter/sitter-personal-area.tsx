"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Camera, User } from "lucide-react";
import {
  OnboardingChips,
  OnboardingSelect,
  OnboardingYesNo
} from "@/components/onboarding/onboarding-fields";
import { IsraelCitiesMultiSelect } from "@/components/geo/israel-cities-multi-select";
import { WelcomeReplayCard } from "@/components/welcome/welcome-replay-card";
import { IdentityPersonalSection } from "@/components/identity/identity-personal-section";
import { IdentityVerifiedBadgeLive } from "@/components/identity/verified-user-badge";
import {
  joinPersonalAreaSummary,
  sitterBioSummary,
  sitterCapabilitiesSummary,
  sitterLegalSummary,
  sitterPersonalDetailsSummary,
  sitterProfessionalSummary,
  sitterRefereesSummary,
  sitterWorkPreferencesSummary,
  sitterWorkingCitiesSummary
} from "@/components/personal-area/personal-area-summaries";
import {
  PersonalAreaSection,
  PersonalChangeLink,
  PersonalCheckbox,
  PersonalEditModal,
  PersonalField,
  PersonalStaticRow,
  formatDisplayDate,
  personalInputClassName,
  personalTextareaClassName,
  yesNoLabel
} from "@/components/personal-area/personal-area-ui";
import { SitterManualReceivingDestinationsSection } from "@/components/sitter/SitterManualReceivingDestinationsSection";
import { getAccountDobEligibilityError } from "@/lib/auth/age-eligibility";
import type { IsraelCity } from "@/lib/geo/israel-cities";
import { isIsraelCity, normalizeWorkingCities } from "@/lib/geo/israel-cities";
import {
  filterKnownValues,
  isSitterAdditionalService,
  isSitterAgeGroup,
  isSitterCurrentStatus,
  isSitterExperienceBand,
  isSitterIncomeRange,
  isSitterTaskCapability,
  isSitterTravelDistance,
  isSitterWorkType,
  parseDesiredHoursPerWeek,
  SITTER_ADDITIONAL_SERVICE_OPTIONS,
  SITTER_AGE_GROUP_OPTIONS,
  SITTER_CURRENT_STATUS_OPTIONS,
  SITTER_DESIRED_HOURS_MAX,
  SITTER_DESIRED_HOURS_MIN,
  SITTER_EXPERIENCE_BAND_OPTIONS,
  SITTER_INCOME_RANGE_OPTIONS,
  SITTER_MAX_CHILDREN_OPTIONS,
  SITTER_TASK_OPTIONS,
  SITTER_TRAVEL_DISTANCE_OPTIONS,
  SITTER_WORK_TYPE_OPTIONS,
  yearsExperienceFromBand,
  type SitterAdditionalService,
  type SitterAgeGroup,
  type SitterCurrentStatus,
  type SitterExperienceBand,
  type SitterIncomeRange,
  type SitterMaxChildren,
  type SitterTaskCapability,
  type SitterTravelDistance,
  type SitterWorkType
} from "@/lib/onboarding/sitter-options";
import { parseSitterHourlyRate } from "@/lib/onboarding/sitter-questionnaire";
import {
  experienceBandFromYears,
  parseOptionalBoolean,
  parseSitterAgeGroups,
  sitterAdditionalServicesLabel,
  sitterAgeGroupsLabel,
  sitterCurrentStatusLabel,
  sitterDesiredHoursLabel,
  sitterExperienceBandLabel,
  sitterHomeCityLabel,
  sitterIncomeRangeLabel,
  sitterMaxChildrenLabel,
  sitterTaskCapabilitiesLabel,
  sitterTravelDistanceLabel,
  sitterWorkTypesLabel
} from "@/lib/sitter/sitter-questionnaire-display";
import {
  formatPreferredAgesDisplay,
  formatPreferredAgesRange,
  formatSitterDisplayName,
  formatSitterLanguagesDisplay,
  normalizePreferredAges,
  normalizeSitterLanguages,
  parsePreferredAges,
  PREFERRED_AGE_MAX,
  PREFERRED_AGE_MIN,
  SITTER_LANGUAGE_OPTIONS,
  type SitterLanguage,
  type SitterProfileRow
} from "@/lib/sitter/sitter-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  formatContactPhoneDisplay,
  requestSaveOwnContactPhone,
  validateContactPhoneInput
} from "@/lib/profile/contact-phone";

type FormState = {
  first_name: string;
  last_name: string;
  birth_date: string;
  show_age: boolean;
  show_full_name: boolean;
  id_number: string;
  address_full: string;
  citizenship_israeli: boolean | null;
  birth_country: string;
  aliyah_year: string;
  military_service: string;
  years_experience: string;
  hourly_rate_nis: string;
  preferred_ages: string;
  languages: SitterLanguage[];
  has_car: boolean;
  homework_help: boolean;
  light_cooking: boolean;
  bio: string;
  referee_phone_1: string;
  referee_phone_2: string;
  legal_no_criminal_declaration: boolean;
  working_cities: IsraelCity[];
  home_city: string;
  years_experience_band: SitterExperienceBand | "";
  experience_age_groups: SitterAgeGroup[];
  has_drivers_license: boolean | null;
  is_smoker: boolean | null;
  has_baby_experience: boolean | null;
  has_multiple_children_experience: boolean | null;
  current_status: SitterCurrentStatus | "";
  desired_hours_per_week: string;
  desired_monthly_income_range: SitterIncomeRange | "";
  work_type_preferences: SitterWorkType[];
  travel_distance: SitterTravelDistance | "";
  accepts_short_notice_shifts: boolean | null;
  additional_service_interests: SitterAdditionalService[];
  preferred_child_age_groups: SitterAgeGroup[];
  max_children: SitterMaxChildren | null;
  has_special_needs_experience: boolean | null;
  special_needs_experience_details: string;
  task_capabilities: SitterTaskCapability[];
  has_first_aid_training: boolean | null;
  has_childcare_training: boolean | null;
  childcare_training_details: string;
  nanny_serial: string;
  avatar_url: string;
  phone: string;
};

type EditKey =
  | "first_name"
  | "last_name"
  | "birth_date"
  | "phone"
  | "id_number"
  | "address_full"
  | "years_experience"
  | "hourly_rate_nis"
  | "military_service"
  | "preferred_ages"
  | "languages"
  | "citizenship_israeli"
  | "birth_country"
  | "aliyah_year"
  | "bio"
  | "referee_phone_1"
  | "referee_phone_2"
  | "working_cities"
  | "home_city"
  | "capabilities"
  | "work_preferences"
  | "visibility"
  | "skills"
  | "legal"
  | "avatar";

function militaryToForm(value: unknown): string {
  if (value === true || value === "true" || value === "כן") return "כן";
  if (value === false || value === "false" || value === "לא") return "לא";
  if (typeof value === "string" && value.trim()) return value.trim();
  return "כן";
}

function militaryToPayload(value: string): string {
  return value === "לא" ? "לא" : "כן";
}

function toggleLanguage(current: readonly SitterLanguage[], language: SitterLanguage): SitterLanguage[] {
  const selected = normalizeSitterLanguages(current);
  return selected.includes(language)
    ? selected.filter((item) => item !== language)
    : normalizeSitterLanguages([...selected, language]);
}

const PREFERRED_AGE_OPTIONS = Array.from(
  { length: PREFERRED_AGE_MAX - PREFERRED_AGE_MIN + 1 },
  (_, index) => PREFERRED_AGE_MIN + index
);

function PreferredAgesEditor({
  value,
  onChange
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const parsed = parsePreferredAges(value);
  const minAge = parsed?.min ?? 1;
  const maxAge = parsed?.max ?? 12;
  const current = formatPreferredAgesRange(minAge, maxAge);

  return (
    <div className="space-y-3 text-right">
      <div className="grid grid-cols-2 gap-3">
        <PersonalField label="מגיל">
          <select
            className={personalInputClassName}
            value={minAge}
            onChange={(e) => {
              const nextMin = Number(e.target.value);
              onChange(formatPreferredAgesRange(nextMin, Math.max(nextMin, maxAge)));
            }}
          >
            {PREFERRED_AGE_OPTIONS.map((age) => (
              <option key={`min-${age}`} value={age}>
                {age}
              </option>
            ))}
          </select>
        </PersonalField>
        <PersonalField label="עד גיל">
          <select
            className={personalInputClassName}
            value={maxAge}
            onChange={(e) => {
              const nextMax = Number(e.target.value);
              onChange(formatPreferredAgesRange(Math.min(minAge, nextMax), nextMax));
            }}
          >
            {PREFERRED_AGE_OPTIONS.map((age) => (
              <option key={`max-${age}`} value={age}>
                {age}
              </option>
            ))}
          </select>
        </PersonalField>
      </div>

      <p className="text-[14px] text-slate-500">
        יוצג בפרופיל כ־<span className="font-semibold text-[#001F3F]" dir="ltr">{current}</span>
      </p>
    </div>
  );
}

function profileToForm(profile: SitterProfileRow | null): FormState {
  return {
    first_name: profile?.first_name ?? "",
    last_name: profile?.last_name ?? "",
    birth_date: (profile?.birth_date ?? "").toString().slice(0, 10),
    show_age: profile?.show_age !== false,
    show_full_name: Boolean(profile?.show_full_name),
    id_number: profile?.id_number ?? "",
    address_full: profile?.address_full ?? "",
    citizenship_israeli:
      profile?.citizenship_israeli === true
        ? true
        : profile?.citizenship_israeli === false
          ? false
          : null,
    birth_country: profile?.birth_country ?? "",
    aliyah_year: profile?.aliyah_year != null ? String(profile.aliyah_year) : "",
    military_service: militaryToForm(profile?.military_service),
    years_experience: profile?.years_experience != null ? String(profile.years_experience) : "",
    years_experience_band:
      profile?.years_experience_band && isSitterExperienceBand(profile.years_experience_band)
        ? profile.years_experience_band
        : experienceBandFromYears(profile?.years_experience ?? null),
    experience_age_groups: parseSitterAgeGroups(profile?.experience_age_groups),
    has_drivers_license: parseOptionalBoolean(profile?.has_drivers_license),
    is_smoker: parseOptionalBoolean(profile?.is_smoker),
    has_baby_experience: parseOptionalBoolean(profile?.has_baby_experience),
    has_multiple_children_experience: parseOptionalBoolean(profile?.has_multiple_children_experience),
    current_status:
      profile?.current_status && isSitterCurrentStatus(profile.current_status)
        ? profile.current_status
        : "",
    desired_hours_per_week:
      profile?.desired_hours_per_week != null ? String(profile.desired_hours_per_week) : "",
    desired_monthly_income_range:
      profile?.desired_monthly_income_range && isSitterIncomeRange(profile.desired_monthly_income_range)
        ? profile.desired_monthly_income_range
        : "",
    work_type_preferences: filterKnownValues(profile?.work_type_preferences ?? [], isSitterWorkType),
    travel_distance:
      profile?.travel_distance && isSitterTravelDistance(profile.travel_distance)
        ? profile.travel_distance
        : "",
    accepts_short_notice_shifts: parseOptionalBoolean(profile?.accepts_short_notice_shifts),
    additional_service_interests: filterKnownValues(
      profile?.additional_service_interests ?? [],
      isSitterAdditionalService
    ),
    preferred_child_age_groups: parseSitterAgeGroups(profile?.preferred_child_age_groups),
    max_children:
      profile?.max_children === 1 ||
      profile?.max_children === 2 ||
      profile?.max_children === 3 ||
      profile?.max_children === 4 ||
      profile?.max_children === 5
        ? profile.max_children
        : null,
    has_special_needs_experience: parseOptionalBoolean(profile?.has_special_needs_experience),
    special_needs_experience_details: profile?.special_needs_experience_details ?? "",
    task_capabilities: filterKnownValues(profile?.task_capabilities ?? [], isSitterTaskCapability),
    has_first_aid_training: parseOptionalBoolean(profile?.has_first_aid_training),
    has_childcare_training: parseOptionalBoolean(profile?.has_childcare_training),
    childcare_training_details: profile?.childcare_training_details ?? "",
    hourly_rate_nis: profile?.hourly_rate_nis != null ? String(profile.hourly_rate_nis) : "",
    preferred_ages: formatPreferredAgesDisplay(profile?.preferred_ages),
    languages: normalizeSitterLanguages(profile?.languages),
    has_car: Boolean(profile?.has_car),
    homework_help: Boolean(profile?.homework_help),
    light_cooking: Boolean(profile?.light_cooking),
    bio: profile?.bio ?? "",
    referee_phone_1: profile?.referee_phone_1 ?? "",
    referee_phone_2: profile?.referee_phone_2 ?? "",
    legal_no_criminal_declaration: Boolean(profile?.legal_no_criminal_declaration),
    working_cities: normalizeWorkingCities(profile?.working_cities),
    home_city: profile?.home_city && isIsraelCity(profile.home_city) ? profile.home_city : profile?.home_city ?? "",
    nanny_serial: profile?.nanny_serial ?? "",
    avatar_url: String(profile?.avatar_url ?? ""),
    phone: String((profile as { phone?: string | null } | null)?.phone ?? "")
  };
}

function formToPayload(form: FormState): Record<string, unknown> {
  return {
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    birth_date: form.birth_date || null,
    show_age: form.show_age,
    show_full_name: form.show_full_name,
    id_number: form.id_number.trim() || null,
    address_full: form.address_full.trim() || null,
    citizenship_israeli: form.citizenship_israeli,
    birth_country: form.birth_country.trim() || null,
    aliyah_year: form.aliyah_year.trim() ? Number(form.aliyah_year) : null,
    military_service: militaryToPayload(form.military_service),
    years_experience: form.years_experience_band
      ? yearsExperienceFromBand(form.years_experience_band)
      : form.years_experience.trim()
        ? Number(form.years_experience)
        : null,
    years_experience_band: form.years_experience_band || null,
    experience_age_groups: form.experience_age_groups,
    preferred_ages: normalizePreferredAges(form.preferred_ages),
    languages: normalizeSitterLanguages(form.languages),
    has_car: form.has_car,
    has_drivers_license: form.has_drivers_license,
    is_smoker: form.is_smoker,
    has_baby_experience: form.has_baby_experience,
    has_multiple_children_experience: form.has_multiple_children_experience,
    current_status: form.current_status || null,
    desired_hours_per_week: parseDesiredHoursPerWeek(form.desired_hours_per_week),
    desired_monthly_income_range: form.desired_monthly_income_range || null,
    work_type_preferences: form.work_type_preferences,
    travel_distance: form.travel_distance || null,
    accepts_short_notice_shifts: form.accepts_short_notice_shifts,
    additional_service_interests: form.additional_service_interests,
    preferred_child_age_groups: form.preferred_child_age_groups,
    max_children: form.max_children,
    has_special_needs_experience: form.has_special_needs_experience,
    special_needs_experience_details: form.special_needs_experience_details.trim() || null,
    task_capabilities: form.task_capabilities,
    has_first_aid_training: form.has_first_aid_training,
    has_childcare_training: form.has_childcare_training,
    childcare_training_details: form.childcare_training_details.trim() || null,
    home_city: form.home_city.trim() || null,
    homework_help: form.homework_help,
    light_cooking: form.light_cooking,
    bio: form.bio.trim().slice(0, 500) || null,
    referee_phone_1: form.referee_phone_1.trim() || null,
    referee_phone_2: form.referee_phone_2.trim() || null,
    working_cities: form.working_cities,
    avatar_url: form.avatar_url.trim() || null,
    service_types: ["babysitter"],
    pricing_model: "hourly",
    hourly_rate_nis: form.hourly_rate_nis.trim() ? Number(form.hourly_rate_nis) : null
  };
}

type Props = {
  userId: string | null;
};

export function SitterPersonalArea({ userId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(profileToForm(null));
  const [editKey, setEditKey] = useState<EditKey | null>(null);
  const [draft, setDraft] = useState<FormState>(profileToForm(null));
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [authPhone, setAuthPhone] = useState("");

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/sitter/profile", { method: "GET", cache: "no-store" });
      const json = (await response.json()) as {
        profile?: (SitterProfileRow & { phone?: string | null }) | null;
        phone?: string | null;
        authPhone?: string | null;
        error?: string;
      };
      if (!response.ok) {
        setError(json.error || "טעינת הפרופיל נכשלה.");
        setLoading(false);
        return;
      }
      const loadedForm = profileToForm({
        ...(json.profile ?? {}),
        phone: json.phone ?? json.profile?.phone ?? ""
      } as SitterProfileRow & { phone?: string | null });
      setAuthPhone(String(json.authPhone ?? "").trim());
      setForm(loadedForm);
      setDraft(loadedForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינת הפרופיל נכשלה.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = useCallback(
    (key: EditKey) => {
      setModalError(null);
      setSuccess(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setDraft({
        ...form,
        working_cities: [...form.working_cities],
        languages: [...form.languages],
        experience_age_groups: [...form.experience_age_groups],
        preferred_child_age_groups: [...form.preferred_child_age_groups],
        work_type_preferences: [...form.work_type_preferences],
        additional_service_interests: [...form.additional_service_interests],
        task_capabilities: [...form.task_capabilities],
        phone: form.phone || authPhone,
        preferred_ages:
          key === "preferred_ages"
            ? formatPreferredAgesDisplay(form.preferred_ages) || formatPreferredAgesRange(1, 12)
            : form.preferred_ages
      });
      setEditKey(key);
    },
    [form, authPhone]
  );

  const closeEdit = useCallback(() => {
    if (saving || uploadingAvatar) return;
    setEditKey(null);
    setModalError(null);
  }, [saving, uploadingAvatar]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    if (file.size > 5 * 1024 * 1024) {
      setModalError("גודל הקובץ חייב להיות עד 5MB.");
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setModalError("יש להעלות תמונה בפורמט JPEG, PNG או WEBP בלבד.");
      return;
    }

    setUploadingAvatar(true);
    setModalError(null);

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("חיבור ל־Supabase אינו זמין.");
      }

      const fileExt = file.name.split(".").pop();
      const filePath = `${userId}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const publicUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

      setDraft((prev) => ({ ...prev, avatar_url: publicUrl }));
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "העלאת התמונה נכשלה.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = useCallback(async () => {
    if (!userId || !editKey) return;

    if (editKey === "first_name" && !draft.first_name.trim()) {
      setModalError("יש למלא שם פרטי.");
      return;
    }

    if (editKey === "last_name" && !draft.last_name.trim()) {
      setModalError("יש למלא שם משפחה.");
      return;
    }

    if (editKey === "working_cities" && draft.working_cities.length === 0) {
      setModalError("יש לבחור לפחות עיר אחת.");
      return;
    }

    if (editKey === "home_city" && draft.home_city.trim() && !isIsraelCity(draft.home_city)) {
      setModalError("יש לבחור עיר / אזור מגורים.");
      return;
    }

    if (editKey === "hourly_rate_nis" && draft.hourly_rate_nis.trim() && parseSitterHourlyRate(draft.hourly_rate_nis) == null) {
      setModalError("יש להזין מחיר לשעה תקין.");
      return;
    }

    if (editKey === "work_preferences" && draft.desired_hours_per_week.trim()) {
      if (parseDesiredHoursPerWeek(draft.desired_hours_per_week) == null) {
        setModalError("יש לבחור מספר שעות בין 1 ל-50.");
        return;
      }
    }

    if (editKey === "birth_date") {
      const dobError = getAccountDobEligibilityError("sitter", draft.birth_date);
      if (dobError) {
        setModalError(dobError);
        return;
      }
    }

    if (editKey === "phone") {
      const phoneError = validateContactPhoneInput(draft.phone);
      if (phoneError) {
        setModalError(phoneError);
        return;
      }
      setSaving(true);
      setModalError(null);
      const saved = await requestSaveOwnContactPhone(draft.phone);
      setSaving(false);
      if (!saved.ok) {
        setModalError(saved.error);
        return;
      }
      setForm((prev) => ({ ...prev, phone: saved.phone }));
      setDraft((prev) => ({ ...prev, phone: saved.phone }));
      setEditKey(null);
      setSuccess("הפרטים עודכנו בהצלחה");
      return;
    }

    setSaving(true);
    setModalError(null);

    try {
      const next = { ...form, ...draft };
      const response = await fetch("/api/sitter/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(next))
      });
      const json = (await response.json()) as { profile?: SitterProfileRow | null; error?: string };
      if (!response.ok) {
        setModalError(json.error || "שמירת הפרופיל נכשלה.");
        setSaving(false);
        return;
      }

      const updatedForm = {
        ...profileToForm(json.profile ?? null),
        phone: form.phone
      };
      setForm(updatedForm);
      setDraft(updatedForm);
      setEditKey(null);
      setSuccess("הפרטים עודכנו בהצלחה");
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "שמירת הפרופיל נכשלה.");
    } finally {
      setSaving(false);
    }
  }, [draft, editKey, form, userId]);

  if (!userId) return null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <p className="text-sm">טוען את האזור האישי…</p>
      </div>
    );
  }

  const displayName =
    formatSitterDisplayName({ first_name: form.first_name, last_name: form.last_name }) ||
    "הפרופיל שלי";

  const skillsLabel = [
    form.has_car ? "רכב / הגעה עצמאית" : null,
    form.homework_help ? "עזרה בשיעורים" : null,
    form.light_cooking ? "בישול קל" : null
  ]
    .filter(Boolean)
    .join(" · ");

  const visibilityLabel = [
    form.show_full_name ? "שם מלא מוצג" : "שם מלא מוסתר",
    form.show_age ? "גיל מוצג" : "גיל מוסתר"
  ].join(" · ");
  const personalSummary = sitterPersonalDetailsSummary(
    sitterHomeCityLabel(form.home_city),
    formatDisplayDate(form.birth_date)
  );
  const professionalSummary = sitterProfessionalSummary(
    sitterExperienceBandLabel(form.years_experience_band),
    form.years_experience,
    sitterAgeGroupsLabel(form.experience_age_groups)
  );
  const workingCitiesSummary = sitterWorkingCitiesSummary(form.working_cities);
  const capabilitiesSummary = sitterCapabilitiesSummary({
    hasLicense: form.has_drivers_license,
    hasCar: form.has_car,
    hasFirstAid: form.has_first_aid_training
  });
  const workPreferencesSummary = sitterWorkPreferencesSummary(
    sitterDesiredHoursLabel(form.desired_hours_per_week),
    form.accepts_short_notice_shifts
  );
  const bioSummary = sitterBioSummary(form.bio);
  const skillsSummary = joinPersonalAreaSummary([skillsLabel]);
  const refereesSummary = sitterRefereesSummary(form.referee_phone_1, form.referee_phone_2);
  const legalSummary = sitterLegalSummary(form.legal_no_criminal_declaration);

  const modalTitle =
    editKey === "avatar"
      ? "עדכון תמונת פרופיל"
      : editKey === "first_name"
      ? "שינוי שם פרטי"
      : editKey === "last_name"
        ? "שינוי שם משפחה"
        : editKey === "birth_date"
          ? "שינוי תאריך לידה"
          : editKey === "phone"
            ? "מספר טלפון"
          : editKey === "id_number"
            ? "שינוי תעודת זהות"
            : editKey === "address_full"
              ? "שינוי כתובת"
              : editKey === "years_experience"
                ? "שינוי שנות ניסיון"
                : editKey === "hourly_rate_nis"
                  ? "שינוי תעריף שעתי"
                  : editKey === "military_service"
                    ? "שינוי שירות צבאי / לאומי"
                    : editKey === "preferred_ages"
                      ? "שינוי גילאים מועדפים"
                      : editKey === "languages"
                        ? "שינוי שפות"
                        : editKey === "citizenship_israeli"
                          ? "שינוי אזרחות"
                          : editKey === "birth_country"
                            ? "שינוי ארץ לידה"
                            : editKey === "aliyah_year"
                              ? "שינוי שנת עלייה"
                              : editKey === "bio"
                                ? "שינוי אודותיי"
                                : editKey === "referee_phone_1"
                                  ? "שינוי טלפון ממליץ 1"
                                  : editKey === "referee_phone_2"
                                    ? "שינוי טלפון ממליץ 2"
                                    : editKey === "working_cities"
                                      ? "שינוי אזור עבודה מועדף"
                                      : editKey === "home_city"
                                        ? "שינוי עיר מגורים"
                                        : editKey === "capabilities"
                                          ? "שינוי יכולות והתאמה"
                                          : editKey === "work_preferences"
                                            ? "שינוי העדפות עבודה"
                                      : editKey === "visibility"
                                        ? "שינוי הגדרות תצוגה"
                                        : editKey === "skills"
                                          ? "שינוי כישורים"
                                          : editKey === "legal"
                                            ? "שינוי הצהרה"
                                            : "";

  return (
    <div className="space-y-4 pb-4" dir="rtl">
      <section className="rounded-2xl border border-[#C5A059]/25 bg-gradient-to-l from-[#FFF8EA] to-white p-4 shadow-soft">
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-[#C5A059]/40 bg-slate-100 shadow-sm">
            {form.avatar_url ? (
              <img src={form.avatar_url} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-400">
                <User className="h-8 w-8" />
              </div>
            )}
            <button
              type="button"
              onClick={() => openEdit("avatar")}
              className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition hover:opacity-100"
              title="שנה תמונה"
            >
              <Camera className="h-5 w-5" />
            </button>
          </div>
          <div>
            <p className="text-xs font-semibold text-[#B8860B]">אזור אישי · בייביסיטר</p>
            <h2 className="mt-1 text-lg font-extrabold text-[#001F3F]">{displayName}</h2>
            {form.nanny_serial ? (
              <p className="mt-0.5 font-mono text-xs font-semibold text-slate-500" dir="ltr">
                {form.nanny_serial}
              </p>
            ) : null}
            <IdentityVerifiedBadgeLive userId={userId} className="mt-1" size="md" />
            <button
              type="button"
              onClick={() => openEdit("avatar")}
              className="mt-1.5 text-xs font-medium text-[#C5A059] underline hover:text-[#b08b4c]"
            >
              החלפת תמונת פרופיל
            </button>
          </div>
        </div>
      </section>

      <WelcomeReplayCard role="sitter" />

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      ) : null}

      <IdentityPersonalSection role="sitter" userId={userId} />

      <PersonalAreaSection
        title="פרטים אישיים"
        description="הפרטים שנשמרו בשאלון ובפרופיל"
        summary={personalSummary}
        defaultOpen
      >
        <PersonalStaticRow label="שם פרטי" value={form.first_name} onEdit={() => openEdit("first_name")} />
        <PersonalStaticRow label="שם משפחה" value={form.last_name} onEdit={() => openEdit("last_name")} />
        <PersonalStaticRow
          label="תאריך לידה"
          value={formatDisplayDate(form.birth_date)}
          onEdit={() => openEdit("birth_date")}
        />
        <PersonalStaticRow
          label="טלפון"
          value={formatContactPhoneDisplay(form.phone || authPhone)}
          onEdit={() => openEdit("phone")}
          dir="ltr"
          actionLabel={form.phone || authPhone ? "שינוי" : "הוספת מספר"}
        />
        <PersonalStaticRow
          label="תעודת זהות"
          value={form.id_number}
          onEdit={() => openEdit("id_number")}
          dir="ltr"
        />
        <PersonalStaticRow
          label="כתובת מלאה"
          value={form.address_full}
          onEdit={() => openEdit("address_full")}
        />
        <PersonalStaticRow
          label="עיר / אזור מגורים"
          value={sitterHomeCityLabel(form.home_city)}
          onEdit={() => openEdit("home_city")}
          actionLabel={form.home_city ? "שינוי" : "הוספה"}
        />
      </PersonalAreaSection>

      <PersonalAreaSection
        title="הגדרות תצוגה"
        accent="sky"
        summary={visibilityLabel}
        action={<PersonalChangeLink onClick={() => openEdit("visibility")} />}
      >
        <p className="text-[16px] font-medium text-[#001F3F]">{visibilityLabel}</p>
      </PersonalAreaSection>

      <PersonalAreaSection title="רקע מקצועי" accent="emerald" summary={professionalSummary}>
        <PersonalStaticRow
          label="שנות ניסיון"
          value={sitterExperienceBandLabel(form.years_experience_band) || form.years_experience}
          onEdit={() => openEdit("years_experience")}
        />
        <PersonalStaticRow
          label="ניסיון לפי גילאים"
          value={sitterAgeGroupsLabel(form.experience_age_groups)}
          onEdit={() => openEdit("years_experience")}
        />
        <PersonalStaticRow
          label="תעריף שעתי"
          value={form.hourly_rate_nis ? `₪${form.hourly_rate_nis}` : ""}
          onEdit={() => openEdit("hourly_rate_nis")}
        />
        <PersonalStaticRow
          label="שירות צבאי / לאומי"
          value={form.military_service}
          onEdit={() => openEdit("military_service")}
        />
        <PersonalStaticRow
          label="גילאים מועדפים"
          value={formatPreferredAgesDisplay(form.preferred_ages)}
          onEdit={() => openEdit("preferred_ages")}
        />
        <PersonalStaticRow
          label="שפות"
          value={formatSitterLanguagesDisplay(form.languages)}
          onEdit={() => openEdit("languages")}
        />
        <PersonalStaticRow
          label="אזרחות ישראלית"
          value={yesNoLabel(form.citizenship_israeli)}
          onEdit={() => openEdit("citizenship_israeli")}
        />
        <PersonalStaticRow
          label="ארץ לידה"
          value={form.birth_country}
          onEdit={() => openEdit("birth_country")}
        />
        <PersonalStaticRow
          label="שנת עלייה"
          value={form.aliyah_year}
          onEdit={() => openEdit("aliyah_year")}
        />
      </PersonalAreaSection>

      <PersonalAreaSection
        title="כישורים"
        accent="emerald"
        summary={skillsSummary}
        action={<PersonalChangeLink onClick={() => openEdit("skills")} />}
      >
        <p className={`text-[16px] ${skillsLabel ? "font-medium text-[#001F3F]" : "italic text-slate-400"}`}>
          {skillsLabel || "לא הוגדרו כישורים נוספים"}
        </p>
      </PersonalAreaSection>

      <PersonalAreaSection
        title="אודותיי"
        accent="sky"
        description="הטקסט שההורים רואים בכרטיס שלך"
        summary={bioSummary}
        action={<PersonalChangeLink onClick={() => openEdit("bio")} />}
      >
        <p
          className={`whitespace-pre-wrap text-[16px] leading-relaxed ${
            form.bio.trim() ? "font-medium text-[#001F3F]" : "italic text-slate-400"
          }`}
        >
          {form.bio.trim() || "לא הוגדר"}
        </p>
      </PersonalAreaSection>

      <PersonalAreaSection
        title="אזור עבודה מועדף"
        description="אותן ערים שמשמשות את חיפוש ההורים. שינוי כאן מתעדכן בחיפוש בלי שאלון מחדש."
        summary={workingCitiesSummary}
        action={<PersonalChangeLink onClick={() => openEdit("working_cities")} />}
      >
        <p
          className={`text-[16px] leading-relaxed ${
            form.working_cities.length ? "font-medium text-[#001F3F]" : "italic text-slate-400"
          }`}
        >
          {form.working_cities.length ? form.working_cities.join(", ") : "לא הוגדר"}
        </p>
      </PersonalAreaSection>

      <PersonalAreaSection
        title="יכולות והתאמה"
        accent="emerald"
        summary={capabilitiesSummary}
        action={<PersonalChangeLink onClick={() => openEdit("capabilities")} label="עריכה" />}
      >
        <PersonalStaticRow label="רישיון נהיגה" value={yesNoLabel(form.has_drivers_license)} onEdit={() => openEdit("capabilities")} />
        <PersonalStaticRow label="רכב" value={yesNoLabel(form.has_car)} onEdit={() => openEdit("capabilities")} />
        <PersonalStaticRow label="מעשנת" value={yesNoLabel(form.is_smoker)} onEdit={() => openEdit("capabilities")} />
        <PersonalStaticRow label="ניסיון עם תינוקות" value={yesNoLabel(form.has_baby_experience)} onEdit={() => openEdit("capabilities")} />
        <PersonalStaticRow label="ניסיון עם כמה ילדים" value={yesNoLabel(form.has_multiple_children_experience)} onEdit={() => openEdit("capabilities")} />
        <PersonalStaticRow label="גילאים מועדפים לעבודה" value={sitterAgeGroupsLabel(form.preferred_child_age_groups)} onEdit={() => openEdit("capabilities")} />
        <PersonalStaticRow label="מספר ילדים מקסימלי" value={sitterMaxChildrenLabel(form.max_children)} onEdit={() => openEdit("capabilities")} />
        <PersonalStaticRow label="ניסיון עם צרכים מיוחדים" value={yesNoLabel(form.has_special_needs_experience)} onEdit={() => openEdit("capabilities")} />
        <PersonalStaticRow
          label="פירוט צרכים מיוחדים"
          value={form.has_special_needs_experience === true ? form.special_needs_experience_details : ""}
          onEdit={() => openEdit("capabilities")}
        />
        <PersonalStaticRow label="יכולות במשימות" value={sitterTaskCapabilitiesLabel(form.task_capabilities)} onEdit={() => openEdit("capabilities")} />
        <PersonalStaticRow label="הכשרת עזרה ראשונה" value={yesNoLabel(form.has_first_aid_training)} onEdit={() => openEdit("capabilities")} />
        <PersonalStaticRow label="הכשרה בטיפול בילדים" value={yesNoLabel(form.has_childcare_training)} onEdit={() => openEdit("capabilities")} />
        <PersonalStaticRow
          label="פירוט הכשרה"
          value={form.has_childcare_training === true ? form.childcare_training_details : ""}
          onEdit={() => openEdit("capabilities")}
        />
      </PersonalAreaSection>

      <PersonalAreaSection
        title="העדפות עבודה"
        accent="sky"
        summary={workPreferencesSummary}
        action={<PersonalChangeLink onClick={() => openEdit("work_preferences")} label="עריכה" />}
      >
        <PersonalStaticRow label="סטטוס נוכחי" value={sitterCurrentStatusLabel(form.current_status)} onEdit={() => openEdit("work_preferences")} />
        <PersonalStaticRow label="שעות רצויות בשבוע" value={sitterDesiredHoursLabel(form.desired_hours_per_week)} onEdit={() => openEdit("work_preferences")} />
        <PersonalStaticRow label="טווח הכנסה חודשי רצוי" value={sitterIncomeRangeLabel(form.desired_monthly_income_range)} onEdit={() => openEdit("work_preferences")} />
        <PersonalStaticRow label="סוג עבודה מועדף" value={sitterWorkTypesLabel(form.work_type_preferences)} onEdit={() => openEdit("work_preferences")} />
        <PersonalStaticRow label="מרחק נסיעה" value={sitterTravelDistanceLabel(form.travel_distance)} onEdit={() => openEdit("work_preferences")} />
        <PersonalStaticRow label="משמרות בהתראה קצרה" value={yesNoLabel(form.accepts_short_notice_shifts)} onEdit={() => openEdit("work_preferences")} />
        <PersonalStaticRow label="עניין בשירותים נוספים" value={sitterAdditionalServicesLabel(form.additional_service_interests)} onEdit={() => openEdit("work_preferences")} />
      </PersonalAreaSection>

      <PersonalAreaSection title="אנשי קשר ממליצים" accent="gold" summary={refereesSummary}>
        <PersonalStaticRow
          label="טלפון ממליץ 1"
          value={form.referee_phone_1}
          onEdit={() => openEdit("referee_phone_1")}
          dir="ltr"
        />
        <PersonalStaticRow
          label="טלפון ממליץ 2"
          value={form.referee_phone_2}
          onEdit={() => openEdit("referee_phone_2")}
          dir="ltr"
        />
      </PersonalAreaSection>

      <PersonalAreaSection
        title="הצהרה"
        accent="gold"
        summary={legalSummary}
        action={<PersonalChangeLink onClick={() => openEdit("legal")} />}
      >
        <p className="text-[16px] font-medium text-[#001F3F]">
          {form.legal_no_criminal_declaration
            ? "הצהרת היעדר עבר פלילי רלוונטי אושרה"
            : "הצהרה טרם אושרה"}
        </p>
      </PersonalAreaSection>

      <SitterManualReceivingDestinationsSection sitterId={userId} />

      <PersonalEditModal
        open={editKey != null}
        title={modalTitle}
        onClose={closeEdit}
        onSave={handleSave}
        saving={saving || uploadingAvatar}
        error={modalError}
      >
        {editKey === "avatar" ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-2">
            <div className="relative h-28 w-28 overflow-hidden rounded-full border-2 border-slate-200 bg-slate-100 shadow-inner">
              {draft.avatar_url ? (
                <img src={draft.avatar_url} alt="תמונת פרופיל" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <User className="h-12 w-12" />
                </div>
              )}
              {uploadingAvatar && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                  <Loader2 className="h-6 w-6 animate-spin text-[#001F3F]" />
                </div>
              )}
            </div>

            <label className="cursor-pointer rounded-xl bg-[#001F3F] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#001F3F]/90">
              {uploadingAvatar ? "מעלה תמונה..." : "בחר תמונה מהמכשיר"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
                disabled={uploadingAvatar}
              />
            </label>
            <p className="text-center text-[13px] text-slate-500">
              פורמטים מותרים: JPG, PNG, WEBP (עד 5MB)
            </p>
          </div>
        ) : null}

        {editKey === "first_name" ||
        editKey === "last_name" ||
        editKey === "phone" ||
        editKey === "id_number" ||
        editKey === "address_full" ||
        editKey === "birth_country" ||
        editKey === "referee_phone_1" ||
        editKey === "referee_phone_2" ? (
          <PersonalField label={editKey === "phone" ? "מספר טלפון" : modalTitle.replace("שינוי ", "")}>
            <input
              className={personalInputClassName}
              value={
                editKey === "first_name"
                  ? draft.first_name
                  : editKey === "last_name"
                    ? draft.last_name
                    : editKey === "phone"
                      ? draft.phone
                    : editKey === "id_number"
                      ? draft.id_number
                      : editKey === "address_full"
                        ? draft.address_full
                        : editKey === "birth_country"
                          ? draft.birth_country
                          : editKey === "referee_phone_1"
                            ? draft.referee_phone_1
                            : draft.referee_phone_2
              }
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  [editKey]: e.target.value
                }))
              }
              dir={
                editKey === "phone" ||
                editKey === "id_number" ||
                editKey === "referee_phone_1" ||
                editKey === "referee_phone_2"
                  ? "ltr"
                  : undefined
              }
              inputMode={editKey === "phone" ? "tel" : undefined}
              autoComplete={editKey === "phone" ? "tel" : undefined}
              placeholder={editKey === "phone" ? "0501234567" : undefined}
              autoFocus
            />
          </PersonalField>
        ) : null}

        {editKey === "preferred_ages" ? (
          <PreferredAgesEditor
            value={draft.preferred_ages}
            onChange={(next) => setDraft((prev) => ({ ...prev, preferred_ages: next }))}
          />
        ) : null}

        {editKey === "languages" ? (
          <PersonalField label="שפות">
            <div className="flex flex-wrap justify-end gap-2" role="group" aria-label="בחירת שפות">
              {SITTER_LANGUAGE_OPTIONS.map((language) => {
                const selected = draft.languages.includes(language);
                return (
                  <button
                    key={language}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        languages: toggleLanguage(prev.languages, language)
                      }))
                    }
                    className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
                      selected
                        ? "border-[#001F3F] bg-[#001F3F] text-white"
                        : "border-[#001F3F]/15 bg-white text-[#001F3F] hover:border-[#001F3F]/35 hover:bg-[#FDFBF6]"
                    }`}
                  >
                    {language}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[13px] text-slate-500">ניתן לבחור שפה אחת או יותר</p>
          </PersonalField>
        ) : null}

        {editKey === "birth_date" ? (
          <PersonalField label="תאריך לידה">
            <input
              type="date"
              className={personalInputClassName}
              value={draft.birth_date}
              onChange={(e) => setDraft((prev) => ({ ...prev, birth_date: e.target.value }))}
              autoFocus
            />
          </PersonalField>
        ) : null}

        {editKey === "hourly_rate_nis" || editKey === "aliyah_year" ? (
          <PersonalField label={modalTitle.replace("שינוי ", "")}>
            <input
              type="number"
              className={personalInputClassName}
              value={editKey === "hourly_rate_nis" ? draft.hourly_rate_nis : draft.aliyah_year}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  [editKey]: e.target.value
                }))
              }
              autoFocus
            />
          </PersonalField>
        ) : null}

        {editKey === "years_experience" ? (
          <div className="space-y-4">
            <OnboardingSelect
              id="sitter-experience-band"
              label="שנות ניסיון"
              value={draft.years_experience_band}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  years_experience_band: isSitterExperienceBand(value) ? value : "",
                  years_experience: isSitterExperienceBand(value)
                    ? String(yearsExperienceFromBand(value))
                    : prev.years_experience
                }))
              }
              options={SITTER_EXPERIENCE_BAND_OPTIONS}
            />
            <OnboardingChips
              legend="עם אילו גילאים יש לך ניסיון"
              options={SITTER_AGE_GROUP_OPTIONS}
              value={draft.experience_age_groups}
              onChange={(value) => setDraft((prev) => ({ ...prev, experience_age_groups: value }))}
            />
          </div>
        ) : null}

        {editKey === "home_city" ? (
          <IsraelCitiesMultiSelect
            value={(draft.home_city && isIsraelCity(draft.home_city) ? [draft.home_city] : []) as IsraelCity[]}
            onChange={(cities) =>
              setDraft((prev) => ({ ...prev, home_city: cities[cities.length - 1] || "" }))
            }
            label="בחרו עיר מגורים"
          />
        ) : null}

        {editKey === "capabilities" ? (
          <div className="space-y-4">
            <OnboardingYesNo
              legend="יש רישיון נהיגה?"
              name="sitter-license"
              value={draft.has_drivers_license}
              onChange={(value) => setDraft((prev) => ({ ...prev, has_drivers_license: value }))}
            />
            <OnboardingYesNo
              legend="יש רכב?"
              name="sitter-car"
              value={draft.has_car}
              onChange={(value) => setDraft((prev) => ({ ...prev, has_car: value }))}
            />
            <OnboardingYesNo
              legend="מעשנת?"
              name="sitter-smoker"
              value={draft.is_smoker}
              onChange={(value) => setDraft((prev) => ({ ...prev, is_smoker: value }))}
            />
            <OnboardingYesNo
              legend="יש ניסיון עם תינוקות?"
              name="sitter-baby"
              value={draft.has_baby_experience}
              onChange={(value) => setDraft((prev) => ({ ...prev, has_baby_experience: value }))}
            />
            <OnboardingYesNo
              legend="יש ניסיון עם כמה ילדים במקביל?"
              name="sitter-multi"
              value={draft.has_multiple_children_experience}
              onChange={(value) =>
                setDraft((prev) => ({ ...prev, has_multiple_children_experience: value }))
              }
            />
            <OnboardingChips
              legend="גילאים מועדפים לעבודה"
              options={SITTER_AGE_GROUP_OPTIONS}
              value={draft.preferred_child_age_groups}
              onChange={(value) => setDraft((prev) => ({ ...prev, preferred_child_age_groups: value }))}
            />
            <OnboardingSelect
              id="sitter-max-children"
              label="מספר ילדים מקסימלי"
              value={draft.max_children == null ? "" : String(draft.max_children)}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  max_children: (SITTER_MAX_CHILDREN_OPTIONS as readonly number[]).includes(Number(value))
                    ? (Number(value) as SitterMaxChildren)
                    : null
                }))
              }
              options={SITTER_MAX_CHILDREN_OPTIONS.map((value) => ({
                value: String(value),
                label: value === 5 ? "5+" : String(value)
              }))}
            />
            <OnboardingYesNo
              legend="יש ניסיון עם צרכים מיוחדים?"
              name="sitter-special-needs"
              value={draft.has_special_needs_experience}
              onChange={(value) => setDraft((prev) => ({ ...prev, has_special_needs_experience: value }))}
            />
            {draft.has_special_needs_experience === true ? (
              <PersonalField label="פירוט קצר">
                <textarea
                  className={personalTextareaClassName}
                  value={draft.special_needs_experience_details}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, special_needs_experience_details: e.target.value }))
                  }
                />
              </PersonalField>
            ) : null}
            <OnboardingChips
              legend="יכולות במשימות"
              options={SITTER_TASK_OPTIONS}
              value={draft.task_capabilities}
              onChange={(value) => setDraft((prev) => ({ ...prev, task_capabilities: value }))}
            />
            <OnboardingYesNo
              legend="הכשרת עזרה ראשונה?"
              name="sitter-first-aid"
              value={draft.has_first_aid_training}
              onChange={(value) => setDraft((prev) => ({ ...prev, has_first_aid_training: value }))}
            />
            <OnboardingYesNo
              legend="הכשרה בטיפול בילדים?"
              name="sitter-childcare-training"
              value={draft.has_childcare_training}
              onChange={(value) => setDraft((prev) => ({ ...prev, has_childcare_training: value }))}
            />
            {draft.has_childcare_training === true ? (
              <PersonalField label="פירוט הכשרה">
                <textarea
                  className={personalTextareaClassName}
                  value={draft.childcare_training_details}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, childcare_training_details: e.target.value }))
                  }
                />
              </PersonalField>
            ) : null}
          </div>
        ) : null}

        {editKey === "work_preferences" ? (
          <div className="space-y-4">
            <OnboardingSelect
              id="sitter-current-status"
              label="סטטוס נוכחי"
              value={draft.current_status}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  current_status: isSitterCurrentStatus(value) ? value : ""
                }))
              }
              options={SITTER_CURRENT_STATUS_OPTIONS}
            />
            <OnboardingSelect
              id="sitter-desired-hours"
              label="שעות רצויות בשבוע"
              value={draft.desired_hours_per_week}
              onChange={(value) => setDraft((prev) => ({ ...prev, desired_hours_per_week: value }))}
              options={Array.from(
                { length: SITTER_DESIRED_HOURS_MAX - SITTER_DESIRED_HOURS_MIN + 1 },
                (_, index) => {
                  const hours = SITTER_DESIRED_HOURS_MIN + index;
                  return { value: String(hours), label: `${hours}` };
                }
              )}
            />
            <OnboardingSelect
              id="sitter-income"
              label="טווח הכנסה חודשי רצוי"
              value={draft.desired_monthly_income_range}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  desired_monthly_income_range: isSitterIncomeRange(value) ? value : ""
                }))
              }
              options={SITTER_INCOME_RANGE_OPTIONS}
            />
            <OnboardingChips
              legend="סוג עבודה מועדף"
              options={SITTER_WORK_TYPE_OPTIONS}
              value={draft.work_type_preferences}
              onChange={(value) => setDraft((prev) => ({ ...prev, work_type_preferences: value }))}
            />
            <OnboardingSelect
              id="sitter-travel"
              label="מרחק נסיעה"
              value={draft.travel_distance}
              onChange={(value) =>
                setDraft((prev) => ({
                  ...prev,
                  travel_distance: isSitterTravelDistance(value) ? value : ""
                }))
              }
              options={SITTER_TRAVEL_DISTANCE_OPTIONS}
            />
            <OnboardingYesNo
              legend="מוכנה למשמרות בהתראה קצרה?"
              name="sitter-short-notice"
              value={draft.accepts_short_notice_shifts}
              onChange={(value) => setDraft((prev) => ({ ...prev, accepts_short_notice_shifts: value }))}
            />
            <OnboardingChips
              legend="עניין בשירותים נוספים"
              options={SITTER_ADDITIONAL_SERVICE_OPTIONS}
              value={draft.additional_service_interests}
              onChange={(value) =>
                setDraft((prev) => ({ ...prev, additional_service_interests: value }))
              }
            />
          </div>
        ) : null}

        {editKey === "military_service" ? (
          <PersonalField label="שירות צבאי / לאומי">
            <select
              className={personalInputClassName}
              value={draft.military_service}
              onChange={(e) => setDraft((prev) => ({ ...prev, military_service: e.target.value }))}
            >
              <option value="כן">כן</option>
              <option value="לא">לא</option>
            </select>
          </PersonalField>
        ) : null}

        {editKey === "citizenship_israeli" ? (
          <PersonalField label="אזרחות ישראלית">
            <select
              className={personalInputClassName}
              value={
                draft.citizenship_israeli === true
                  ? "yes"
                  : draft.citizenship_israeli === false
                    ? "no"
                    : ""
              }
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  citizenship_israeli:
                    e.target.value === "yes" ? true : e.target.value === "no" ? false : null
                }))
              }
            >
              <option value="">לא צוין</option>
              <option value="yes">כן</option>
              <option value="no">לא</option>
            </select>
          </PersonalField>
        ) : null}

        {editKey === "bio" ? (
          <PersonalField label="ביוגרפיה מקצועית">
            <textarea
              className={personalTextareaClassName}
              value={draft.bio}
              maxLength={500}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  bio: e.target.value.slice(0, 500)
                }))
              }
              autoFocus
            />
            <p className="mt-1 text-[13px] text-slate-400">
              {draft.bio.length}/500
            </p>
          </PersonalField>
        ) : null}

        {editKey === "working_cities" ? (
          <IsraelCitiesMultiSelect
            value={draft.working_cities}
            onChange={(cities) => setDraft((prev) => ({ ...prev, working_cities: cities }))}
            label="בחרו ערים"
          />
        ) : null}

        {editKey === "visibility" ? (
          <div className="space-y-2">
            <PersonalCheckbox
              checked={draft.show_full_name}
              onChange={(next) => setDraft((prev) => ({ ...prev, show_full_name: next }))}
              label="הצג שם מלא להורים"
            />
            <PersonalCheckbox
              checked={draft.show_age}
              onChange={(next) => setDraft((prev) => ({ ...prev, show_age: next }))}
              label="הצג גיל להורים"
            />
          </div>
        ) : null}

        {editKey === "skills" ? (
          <div className="space-y-2">
            <PersonalCheckbox
              checked={draft.has_car}
              onChange={(next) => setDraft((prev) => ({ ...prev, has_car: next }))}
              label="יש לי רכב / הגעה עצמאית"
            />
            <PersonalCheckbox
              checked={draft.homework_help}
              onChange={(next) => setDraft((prev) => ({ ...prev, homework_help: next }))}
              label="עזרה בשיעורי בית"
            />
            <PersonalCheckbox
              checked={draft.light_cooking}
              onChange={(next) => setDraft((prev) => ({ ...prev, light_cooking: next }))}
              label="בישול קל"
            />
          </div>
        ) : null}

        {editKey === "legal" ? (
          <PersonalCheckbox
            checked={draft.legal_no_criminal_declaration}
            onChange={(next) =>
              setDraft((prev) => ({ ...prev, legal_no_criminal_declaration: next }))
            }
            label="אני מצהירה שאין לי עבר פלילי רלוונטי"
          />
        ) : null}
      </PersonalEditModal>
    </div>
  );
}