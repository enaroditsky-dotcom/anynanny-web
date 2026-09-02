"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExpertRegistrationFields } from "@/components/sitter/expert-registration-fields";
import { IsraelCitiesMultiSelect } from "@/components/geo/israel-cities-multi-select";
import { IdentityOnboardingCard } from "@/components/identity/identity-onboarding-card";
import { IdentityVerificationForm } from "@/components/identity/identity-verification-form";
import {
  OnboardingActions,
  OnboardingCard,
  OnboardingPageShell
} from "@/components/onboarding/onboarding-shell";
import {
  OnboardingChips,
  OnboardingChoiceRow,
  OnboardingDateInput,
  OnboardingSelect,
  OnboardingTextInput,
  OnboardingYesNo
} from "@/components/onboarding/onboarding-fields";
import {
  coalesceSignupNames,
  hasCompleteSignupNames,
  namesFromUserMetadata,
  readSignupNamesFromDevice,
  saveSignupNamesToDevice
} from "@/lib/auth/signup-names";
import { clearSecondRoleInProgress } from "@/lib/auth/product-profiles";
import { isIsraelCity, type IsraelCity } from "@/lib/geo/israel-cities";
import {
  formatDesiredHoursLabel,
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
  SITTER_WORK_TYPE_OPTIONS
} from "@/lib/onboarding/sitter-options";
import {
  buildSitterOnboardingCorePayload,
  buildSitterOnboardingExtendedPayload,
  buildSitterProfilePhonePatch,
  emptySitterOnboardingDraft,
  sitterPreferredWorkAreaFromDraft,
  validateSitterOnboardingRequiredFields,
  validateSitterOnboardingStep,
  type SitterOnboardingDraft
} from "@/lib/onboarding/sitter-questionnaire";
import { updateRowStrippingUnknownColumns } from "@/lib/onboarding/persist";
import { ONBOARDING_NAME_MAX_LENGTH, ONBOARDING_STEP_COUNT } from "@/lib/onboarding/shared";
import {
  emptyExpertProfileDraft,
  expertDraftToProfilePatch,
  isExpertOnlyServiceKind,
  normalizeExpertServiceTypes,
  normalizePricingModel,
  normalizeServiceLocations,
  validateExpertProfileDraft,
  type ExpertProfileDraft
} from "@/lib/sitter/expert-profile";
import {
  ensureSitterProfileRowForUser,
  hasSitterCompletedOnboarding,
  normalizeSitterLanguages,
  SITTER_LANGUAGE_OPTIONS,
  SITTER_PROFILES_TABLE,
  SITTER_PROFILES_USER_COLUMN,
  SITTER_WORKING_CITIES_COLUMN
} from "@/lib/sitter/sitter-profile";
import { updateSitterWorkingCities } from "@/lib/sitter/sitter-working-cities";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

type Props = {
  onSaved?: () => void | Promise<void>;
};

function readIsExpertTrack(): boolean {
  try {
    return localStorage.getItem("anynanny_service_track") === "expert";
  } catch {
    return false;
  }
}

const HOURS_OPTIONS = Array.from(
  { length: SITTER_DESIRED_HOURS_MAX - SITTER_DESIRED_HOURS_MIN + 1 },
  (_, index) => {
    const value = String(index + SITTER_DESIRED_HOURS_MIN);
    return { value, label: formatDesiredHoursLabel(index + SITTER_DESIRED_HOURS_MIN) };
  }
);

export function SitterOnboardingWizard({ onSaved }: Props) {
  const router = useRouter();
  const [isExpert, setIsExpert] = useState(false);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SitterOnboardingDraft>(emptySitterOnboardingDraft);
  const [expertDraft, setExpertDraft] = useState<ExpertProfileDraft>(() => emptyExpertProfileDraft());
  const [verifyFormOpen, setVerifyFormOpen] = useState(false);

  const updateDraft = (patch: Partial<SitterOnboardingDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  useEffect(() => {
    setIsExpert(readIsExpertTrack());
    void (async () => {
      const auth = await resolveBrowserAuth();
      if (!auth.ok) return;

      const {
        data: { user }
      } = await auth.supabase.auth.getUser();
      const metaTrack = user?.user_metadata?.service_track;
      const metaTypes = normalizeExpertServiceTypes(user?.user_metadata?.service_types);
      const expertFromMeta =
        metaTrack === "expert" || metaTypes.some((type) => isExpertOnlyServiceKind(type));
      if (expertFromMeta) {
        setIsExpert(true);
        try {
          localStorage.setItem("anynanny_service_track", "expert");
        } catch {
          /* ignore */
        }
      }

      const [{ data: sitterRow }, { data: profileRow }] = await Promise.all([
        auth.supabase
          .from(SITTER_PROFILES_TABLE)
          .select(
            "first_name, last_name, birth_date, bio, certifications, service_types, service_locations, pricing_model, hourly_rate_nis, package_price_nis, working_cities, languages, home_city"
          )
          .eq(SITTER_PROFILES_USER_COLUMN, auth.userId)
          .maybeSingle(),
        auth.supabase.from(PROFILES_TABLE).select("first_name, last_name, phone").eq("id", auth.userId).maybeSingle()
      ]);

      const resolved = coalesceSignupNames(
        sitterRow,
        profileRow,
        namesFromUserMetadata(user?.user_metadata as Record<string, unknown> | undefined),
        readSignupNamesFromDevice()
      );
      if (hasCompleteSignupNames(resolved)) {
        saveSignupNamesToDevice(resolved);
        if (sitterRow) {
          await ensureSitterProfileRowForUser(auth.supabase, auth.userId, {
            first_name: resolved.first_name,
            last_name: resolved.last_name
          });
        }
      }

      updateDraft({
        firstName: resolved.first_name,
        lastName: resolved.last_name,
        birthDate: sitterRow?.birth_date ? String(sitterRow.birth_date).slice(0, 10) : "",
        homeCity: typeof sitterRow?.home_city === "string" && isIsraelCity(sitterRow.home_city) ? sitterRow.home_city : "",
        preferredWorkArea: Array.isArray(sitterRow?.working_cities)
          ? (sitterRow.working_cities.filter((city: unknown): city is IsraelCity => isIsraelCity(String(city))) as IsraelCity[])
          : [],
        phone: typeof profileRow?.phone === "string" ? profileRow.phone : "",
        languages: normalizeSitterLanguages(sitterRow?.languages),
        hourlyRateNis: sitterRow?.hourly_rate_nis != null ? String(sitterRow.hourly_rate_nis) : ""
      });

      const types = normalizeExpertServiceTypes(sitterRow?.service_types);
      const primary = types.find((type) => isExpertOnlyServiceKind(type));
      if (primary || expertFromMeta) {
        setIsExpert(true);
        const source = sitterRow ?? user?.user_metadata ?? {};
        setExpertDraft({
          serviceType: primary ?? metaTypes.find((type) => isExpertOnlyServiceKind(type)) ?? "lactation_consultant",
          serviceLocations: normalizeServiceLocations(
            (source as { service_locations?: unknown }).service_locations
          ),
          pricingModel: normalizePricingModel((source as { pricing_model?: unknown }).pricing_model),
          hourlyRateNis:
            (source as { hourly_rate_nis?: unknown }).hourly_rate_nis != null
              ? String((source as { hourly_rate_nis?: unknown }).hourly_rate_nis)
              : "",
          packagePriceNis:
            (source as { package_price_nis?: unknown }).package_price_nis != null
              ? String((source as { package_price_nis?: unknown }).package_price_nis)
              : "",
          bio: typeof (source as { bio?: unknown }).bio === "string" ? String((source as { bio?: unknown }).bio) : "",
          certifications:
            typeof (source as { certifications?: unknown }).certifications === "string"
              ? String((source as { certifications?: unknown }).certifications)
              : ""
        });
      }
    })();
  }, []);

  const goNext = () => {
    const current = step as 1 | 2 | 3;
    if (current === 2 && isExpert) {
      const expertError = validateExpertProfileDraft(expertDraft);
      if (expertError) {
        setError(expertError);
        return;
      }
    } else {
      const stepError = validateSitterOnboardingStep(current, draft, isExpert);
      if (stepError) {
        setError(stepError);
        return;
      }
    }
    setError(null);
    setStep((prev) => Math.min(ONBOARDING_STEP_COUNT, prev + 1));
  };

  const handleFinish = async () => {
    if (busy) return;
    if (isExpert) {
      const expertError = validateExpertProfileDraft(expertDraft);
      if (expertError) {
        setError(expertError);
        setStep(2);
        return;
      }
    }
    const requiredError = validateSitterOnboardingRequiredFields(draft, isExpert);
    if (requiredError) {
      setError(requiredError);
      setStep(1);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const auth = await resolveBrowserAuth();
      if (!auth.ok) {
        setError("יש להתחבר מחדש כדי לסיים את השאלון.");
        setBusy(false);
        return;
      }

      const ensure = await ensureSitterProfileRowForUser(auth.supabase, auth.userId, {
        first_name: draft.firstName.trim(),
        last_name: draft.lastName.trim(),
        service_types: isExpert ? [expertDraft.serviceType] : ["babysitter"]
      });
      if (ensure.error) {
        setError(ensure.error);
        setBusy(false);
        return;
      }

      const workingCities = sitterPreferredWorkAreaFromDraft(draft);
      const citiesResult = await updateSitterWorkingCities(auth.userId, workingCities);
      if (!citiesResult.ok) {
        setError(citiesResult.error || "שמירת אזור העבודה המועדף נכשלה.");
        setBusy(false);
        return;
      }

      const completedAt = new Date().toISOString();
      const patch: Record<string, unknown> = {
        ...buildSitterOnboardingCorePayload(draft),
        ...buildSitterOnboardingExtendedPayload(draft),
        onboarding_completed_at: completedAt,
        updated_at: completedAt,
        [SITTER_WORKING_CITIES_COLUMN]: citiesResult.cities,
        service_types: isExpert ? [expertDraft.serviceType] : ["babysitter"]
      };
      if (isExpert) {
        Object.assign(patch, expertDraftToProfilePatch(expertDraft));
      }

      const saved = await updateRowStrippingUnknownColumns(
        auth.supabase,
        SITTER_PROFILES_TABLE,
        SITTER_PROFILES_USER_COLUMN,
        auth.userId,
        patch
      );
      if (saved.error) {
        const { data: retryData, error: retryError } = await auth.supabase
          .from(SITTER_PROFILES_TABLE)
          .update({
            onboarding_completed_at: completedAt,
            updated_at: completedAt,
            [SITTER_WORKING_CITIES_COLUMN]: citiesResult.cities
          })
          .eq(SITTER_PROFILES_USER_COLUMN, auth.userId)
          .select("onboarding_completed_at")
          .maybeSingle();
        if (retryError || !hasSitterCompletedOnboarding(retryData ?? {})) {
          setError(retryError?.message || saved.error || "שמירת סיום השאלון נכשלה.");
          setBusy(false);
          return;
        }
      }

      const phonePatch = buildSitterProfilePhonePatch(draft.phone);
      if (Object.keys(phonePatch).length > 0) {
        await updateRowStrippingUnknownColumns(auth.supabase, PROFILES_TABLE, "id", auth.userId, phonePatch);
      }

      await onSaved?.();
      clearSecondRoleInProgress(auth.userId, "sitter");
      router.replace("/sitter/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה.");
    } finally {
      setBusy(false);
    }
  };

  const homeCity = isIsraelCity(draft.homeCity) ? [draft.homeCity] : [];

  return (
    <OnboardingPageShell>
      <OnboardingCard
        title="השאלון של AnyNanny"
        description={
          step === 3
            ? "עוד כמה שאלות שיעזרו לנו להתאים עבורך את AnyNanny. אפשר לדלג על שאלות שאינן רלוונטיות."
            : isExpert
              ? "נשלים את הפרופיל המקצועי ואת אזור העבודה המועדף."
              : "נשלים כמה פרטים חיוניים כדי שההורים יוכלו למצוא אותך."
        }
        step={step}
        error={error}
      >
        {step === 1 ? (
          <div className="space-y-4">
            <OnboardingTextInput
              id="sitter-first-name"
              label="שם פרטי"
              required
              value={draft.firstName}
              onChange={(firstName) => updateDraft({ firstName })}
              autoComplete="given-name"
              maxLength={ONBOARDING_NAME_MAX_LENGTH}
            />
            <OnboardingTextInput
              id="sitter-last-name"
              label="שם משפחה"
              required
              value={draft.lastName}
              onChange={(lastName) => updateDraft({ lastName })}
              autoComplete="family-name"
              maxLength={ONBOARDING_NAME_MAX_LENGTH}
            />
            <OnboardingDateInput
              id="sitter-birth-date"
              label="תאריך לידה"
              required
              value={draft.birthDate}
              onChange={(birthDate) => updateDraft({ birthDate })}
              disallowFuture
            />
            <div className="space-y-1.5 text-right">
              <p className="text-sm font-semibold text-[#001F3F]">
                עיר / אזור מגורים
                <span className="ms-1 text-teal-700" aria-hidden>
                  *
                </span>
                <span className="sr-only"> (שדה חובה)</span>
              </p>
              <IsraelCitiesMultiSelect
                value={homeCity}
                onChange={(cities) => updateDraft({ homeCity: cities.slice(-1)[0] ?? "" })}
                disabled={busy}
                label="בחרי עיר מגורים"
              />
            </div>
            <div className="space-y-1.5 text-right">
              <p className="text-sm font-semibold text-[#001F3F]">
                אזור עבודה מועדף
                <span className="ms-1 text-teal-700" aria-hidden>
                  *
                </span>
                <span className="sr-only"> (שדה חובה)</span>
              </p>
              <IsraelCitiesMultiSelect
                value={draft.preferredWorkArea}
                onChange={(preferredWorkArea) => updateDraft({ preferredWorkArea })}
                disabled={busy}
                label="בחרי ערים שבהן תרצי לעבוד"
              />
            </div>
            <OnboardingTextInput
              id="sitter-phone"
              label="מספר טלפון"
              value={draft.phone}
              onChange={(phone) => updateDraft({ phone })}
              autoComplete="tel"
              inputMode="tel"
            />
            <OnboardingChips
              legend="שפות"
              required
              options={SITTER_LANGUAGE_OPTIONS.map((value) => ({ value, label: value }))}
              value={draft.languages}
              onChange={(languages) => updateDraft({ languages })}
            />
            <OnboardingActions showBack={false} onContinue={goNext} />
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            {isExpert ? (
              <ExpertRegistrationFields value={expertDraft} onChange={setExpertDraft} compact />
            ) : (
              <>
                <OnboardingSelect
                  id="years-experience"
                  label="שנות ניסיון בבייביסיטר"
                  required
                  value={draft.yearsExperienceBand}
                  onChange={(yearsExperienceBand) =>
                    updateDraft({ yearsExperienceBand: yearsExperienceBand as SitterOnboardingDraft["yearsExperienceBand"] })
                  }
                  options={SITTER_EXPERIENCE_BAND_OPTIONS}
                />
                <OnboardingChips
                  legend="עם אילו גילאים יש לך ניסיון?"
                  required
                  options={SITTER_AGE_GROUP_OPTIONS}
                  value={draft.experienceAgeGroups}
                  onChange={(experienceAgeGroups) => updateDraft({ experienceAgeGroups })}
                />
                <OnboardingTextInput
                  id="hourly-rate"
                  label="מחיר לשעה"
                  required
                  value={draft.hourlyRateNis}
                  onChange={(hourlyRateNis) => updateDraft({ hourlyRateNis })}
                  inputMode="decimal"
                />
                <OnboardingYesNo
                  name="license"
                  legend="האם יש לך רישיון נהיגה?"
                  value={draft.hasDriversLicense}
                  onChange={(hasDriversLicense) => updateDraft({ hasDriversLicense })}
                />
                <OnboardingYesNo
                  name="car"
                  legend="האם יש לך רכב זמין?"
                  value={draft.hasCar}
                  onChange={(hasCar) => updateDraft({ hasCar })}
                />
                <OnboardingYesNo
                  name="smoking"
                  legend="האם את מעשנת?"
                  value={draft.isSmoker}
                  onChange={(isSmoker) => updateDraft({ isSmoker })}
                />
                <OnboardingYesNo
                  name="baby"
                  legend="האם יש לך ניסיון בטיפול בתינוקות?"
                  value={draft.hasBabyExperience}
                  onChange={(hasBabyExperience) => updateDraft({ hasBabyExperience })}
                />
                <OnboardingYesNo
                  name="multiple"
                  legend="האם יש לך ניסיון בשמירה על כמה ילדים במקביל?"
                  value={draft.hasMultipleChildrenExperience}
                  onChange={(hasMultipleChildrenExperience) => updateDraft({ hasMultipleChildrenExperience })}
                />
              </>
            )}
            <OnboardingActions onBack={() => setStep(1)} onContinue={goNext} />
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <OnboardingSelect
              id="current-status"
              label="מה המסגרת העיקרית שלך כיום?"
              value={draft.currentStatus}
              onChange={(currentStatus) =>
                updateDraft({ currentStatus: currentStatus as SitterOnboardingDraft["currentStatus"] })
              }
              options={SITTER_CURRENT_STATUS_OPTIONS}
            />
            <OnboardingSelect
              id="desired-hours"
              label="כמה שעות בשבוע היית רוצה לעבוד דרך AnyNanny?"
              value={draft.desiredHoursPerWeek}
              onChange={(desiredHoursPerWeek) => updateDraft({ desiredHoursPerWeek })}
              options={HOURS_OPTIONS}
            />
            <OnboardingSelect
              id="income-range"
              label="כמה היית רוצה להרוויח בחודש מבייביסיטר דרך AnyNanny?"
              value={draft.desiredMonthlyIncomeRange}
              onChange={(desiredMonthlyIncomeRange) =>
                updateDraft({
                  desiredMonthlyIncomeRange: desiredMonthlyIncomeRange as SitterOnboardingDraft["desiredMonthlyIncomeRange"]
                })
              }
              options={SITTER_INCOME_RANGE_OPTIONS}
            />
            <OnboardingChips
              legend="איזה סוג עבודה את מחפשת דרך AnyNanny?"
              options={SITTER_WORK_TYPE_OPTIONS}
              value={draft.workTypePreferences}
              onChange={(workTypePreferences) => updateDraft({ workTypePreferences })}
            />
            <OnboardingSelect
              id="travel-distance"
              label="כמה רחוק את מוכנה להגיע למשמרת?"
              value={draft.travelDistance}
              onChange={(travelDistance) =>
                updateDraft({ travelDistance: travelDistance as SitterOnboardingDraft["travelDistance"] })
              }
              options={SITTER_TRAVEL_DISTANCE_OPTIONS}
            />
            <OnboardingYesNo
              name="short-notice"
              legend="האם תרצי לקבל הצעות למשמרות בהתראה קצרה?"
              value={draft.acceptsShortNoticeShifts}
              onChange={(acceptsShortNoticeShifts) => updateDraft({ acceptsShortNoticeShifts })}
            />
            <OnboardingChips
              legend="באילו סוגי שירותים נוספים היית מעוניינת לעבוד בעתיד?"
              options={SITTER_ADDITIONAL_SERVICE_OPTIONS}
              value={draft.additionalServiceInterests}
              onChange={(additionalServiceInterests) => updateDraft({ additionalServiceInterests })}
            />
            <OnboardingChips
              legend="עם אילו גילאים הכי מתאים לך לעבוד?"
              options={SITTER_AGE_GROUP_OPTIONS}
              value={draft.preferredChildAgeGroups}
              onChange={(preferredChildAgeGroups) => updateDraft({ preferredChildAgeGroups })}
            />
            <OnboardingChoiceRow
              legend="על כמה ילדים את מוכנה לשמור במקביל?"
              value={draft.maxChildren}
              onChange={(maxChildren) => updateDraft({ maxChildren })}
              options={SITTER_MAX_CHILDREN_OPTIONS.map((value) => ({
                value,
                label: value === 5 ? "5+" : String(value)
              }))}
            />
            <OnboardingYesNo
              name="special-needs"
              legend="האם יש לך ניסיון עם ילדים עם צרכים מיוחדים?"
              value={draft.hasSpecialNeedsExperience}
              onChange={(hasSpecialNeedsExperience) => updateDraft({ hasSpecialNeedsExperience })}
            />
            {draft.hasSpecialNeedsExperience ? (
              <OnboardingTextInput
                id="special-needs-details"
                label="פירוט קצר"
                value={draft.specialNeedsExperienceDetails}
                onChange={(specialNeedsExperienceDetails) => updateDraft({ specialNeedsExperienceDetails })}
              />
            ) : null}
            <OnboardingChips
              legend="אילו משימות מתאימות לך במסגרת שמרטפות?"
              options={SITTER_TASK_OPTIONS}
              value={draft.taskCapabilities}
              onChange={(taskCapabilities) => updateDraft({ taskCapabilities })}
            />
            <OnboardingYesNo
              name="first-aid"
              legend="האם יש לך הכשרת עזרה ראשונה?"
              value={draft.hasFirstAidTraining}
              onChange={(hasFirstAidTraining) => updateDraft({ hasFirstAidTraining })}
            />
            <OnboardingYesNo
              name="childcare-training"
              legend="האם עברת הכשרה רלוונטית לטיפול בילדים?"
              value={draft.hasChildcareTraining}
              onChange={(hasChildcareTraining) => updateDraft({ hasChildcareTraining })}
            />
            {draft.hasChildcareTraining ? (
              <OnboardingTextInput
                id="training-details"
                label="פירוט ההכשרה"
                value={draft.childcareTrainingDetails}
                onChange={(childcareTrainingDetails) => updateDraft({ childcareTrainingDetails })}
              />
            ) : null}
            <OnboardingActions onBack={() => setStep(2)} onContinue={goNext} />
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <IdentityOnboardingCard
              busy={busy}
              onVerifyNow={() => setVerifyFormOpen(true)}
              onSkipLater={() => void handleFinish()}
            />
            <OnboardingActions
              onBack={() => setStep(3)}
              onContinue={() => void handleFinish()}
              continueLabel="סיום"
              busy={busy}
            />
          </div>
        ) : null}

        <IdentityVerificationForm
          open={verifyFormOpen}
          role="sitter"
          nextPath="/sitter/profile"
          onClose={() => setVerifyFormOpen(false)}
          onSaved={async () => {
            setVerifyFormOpen(false);
            await handleFinish();
          }}
        />
      </OnboardingCard>
    </OnboardingPageShell>
  );
}
