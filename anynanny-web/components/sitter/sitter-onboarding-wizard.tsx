"use client";

import { useEffect, useRef, useState } from "react";
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
  focusOnboardingStepTarget,
  QuestionnaireSlideFrame,
  QUESTIONNAIRE_SLIDE_MS,
  usePrefersReducedMotion,
  type QuestionnaireSlideDirection
} from "@/components/onboarding/questionnaire-slide";
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
  firstInvalidSitterQuestionnaireFieldId,
  sitterExpertProfileStep,
  sitterPreferredWorkAreaFromDraft,
  sitterQuestionnaireStepCount,
  sitterQuestionnaireStepForRequiredError,
  sitterQuestionnaireStepIdAt,
  SITTER_QUESTIONNAIRE_STEP_DESCRIPTIONS,
  SITTER_QUESTIONNAIRE_STEP_TITLES,
  validateSitterOnboardingRequiredFields,
  validateSitterQuestionnaireWizardStep,
  type SitterOnboardingDraft,
  type SitterQuestionnaireStepId
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

const QUESTIONNAIRE_TITLE_ID = "sitter-questionnaire-step-title";

export function SitterOnboardingWizard({ onSaved }: Props) {
  const router = useRouter();
  const [isExpert, setIsExpert] = useState(false);
  const [questionnaireStep, setQuestionnaireStep] = useState(1);
  const [showIdentity, setShowIdentity] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SitterOnboardingDraft>(emptySitterOnboardingDraft);
  const [expertDraft, setExpertDraft] = useState<ExpertProfileDraft>(() => emptyExpertProfileDraft());
  const [verifyFormOpen, setVerifyFormOpen] = useState(false);
  const [direction, setDirection] = useState<QuestionnaireSlideDirection>("forward");
  const [renderedStep, setRenderedStep] = useState(1);
  const [leavingStep, setLeavingStep] = useState<number | null>(null);
  const reduceMotion = usePrefersReducedMotion();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const skipNextFocusRef = useRef(false);
  const hasNavigatedRef = useRef(false);

  const stepCount = sitterQuestionnaireStepCount(isExpert);
  const stepId = sitterQuestionnaireStepIdAt(questionnaireStep, isExpert);

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

  useEffect(() => {
    setQuestionnaireStep((prev) => Math.min(prev, sitterQuestionnaireStepCount(isExpert)));
  }, [isExpert]);

  useEffect(() => {
    if (showIdentity) return;
    if (questionnaireStep === renderedStep) return;

    if (reduceMotion) {
      setLeavingStep(null);
      setRenderedStep(questionnaireStep);
      return;
    }

    setLeavingStep(renderedStep);
    const timer = window.setTimeout(() => {
      setRenderedStep(questionnaireStep);
      setLeavingStep(null);
    }, QUESTIONNAIRE_SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [questionnaireStep, renderedStep, reduceMotion, showIdentity]);

  useEffect(() => {
    if (showIdentity || leavingStep != null) return;
    if (skipNextFocusRef.current) {
      skipNextFocusRef.current = false;
      return;
    }
    titleRef.current?.focus();
  }, [renderedStep, showIdentity, leavingStep]);

  const goNext = () => {
    if (stepId === "expert-profile") {
      const expertError = validateExpertProfileDraft(expertDraft);
      if (expertError) {
        setError(expertError);
        skipNextFocusRef.current = true;
        window.requestAnimationFrame(() => {
          focusOnboardingStepTarget(QUESTIONNAIRE_TITLE_ID, null);
        });
        return;
      }
    } else {
      const stepError = validateSitterQuestionnaireWizardStep(stepId, draft);
      if (stepError) {
        setError(stepError);
        skipNextFocusRef.current = true;
        window.requestAnimationFrame(() => {
          focusOnboardingStepTarget(
            QUESTIONNAIRE_TITLE_ID,
            firstInvalidSitterQuestionnaireFieldId(stepId, draft)
          );
        });
        return;
      }
    }
    setError(null);
    if (questionnaireStep === stepCount) {
      setShowIdentity(true);
      return;
    }
    hasNavigatedRef.current = true;
    setDirection("forward");
    setQuestionnaireStep((prev) => prev + 1);
  };

  const goBack = () => {
    setError(null);
    if (showIdentity) {
      setShowIdentity(false);
      setDirection("back");
      setQuestionnaireStep(stepCount);
      return;
    }
    if (questionnaireStep === 1) return;
    hasNavigatedRef.current = true;
    setDirection("back");
    setQuestionnaireStep((prev) => prev - 1);
  };

  const handleFinish = async () => {
    if (busy) return;
    if (isExpert) {
      const expertError = validateExpertProfileDraft(expertDraft);
      if (expertError) {
        setError(expertError);
        setShowIdentity(false);
        setQuestionnaireStep(sitterExpertProfileStep(true));
        return;
      }
    }
    const requiredError = validateSitterOnboardingRequiredFields(draft, isExpert);
    if (requiredError) {
      setError(requiredError);
      setShowIdentity(false);
      setQuestionnaireStep(sitterQuestionnaireStepForRequiredError(requiredError, isExpert));
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

  const innerProgress = showIdentity ? null : { current: questionnaireStep, total: stepCount };

  return (
    <OnboardingPageShell>
      <OnboardingCard
        title={showIdentity ? "השאלון של AnyNanny" : SITTER_QUESTIONNAIRE_STEP_TITLES[stepId]}
        description={
          showIdentity
            ? "אפשר לאמת עכשיו או להשלים את זה מאוחר יותר מהאזור האישי."
            : SITTER_QUESTIONNAIRE_STEP_DESCRIPTIONS[stepId]
        }
        step={showIdentity ? ONBOARDING_STEP_COUNT : 1}
        totalSteps={ONBOARDING_STEP_COUNT}
        innerProgress={innerProgress}
        showStageLabel={showIdentity}
        growContent
        wide
        showRequiredNote={!showIdentity && questionnaireStep === 1}
        titleId={QUESTIONNAIRE_TITLE_ID}
        titleRef={titleRef}
        error={error}
      >
        {showIdentity ? (
          <div className="space-y-4">
            <IdentityOnboardingCard
              busy={busy}
              onVerifyNow={() => setVerifyFormOpen(true)}
              onSkipLater={() => void handleFinish()}
            />
            <OnboardingActions
              onBack={goBack}
              onContinue={() => void handleFinish()}
              continueLabel="סיום"
              busy={busy}
            />
          </div>
        ) : (
          <>
            <QuestionnaireSlideFrame
              step={renderedStep}
              leavingStep={leavingStep}
              direction={direction}
              reduceMotion={reduceMotion}
              hasNavigated={hasNavigatedRef.current}
              renderStep={(step, preview) => (
                <QuestionnaireStepFields
                  stepId={sitterQuestionnaireStepIdAt(step, isExpert)}
                  draft={draft}
                  updateDraft={updateDraft}
                  expertDraft={expertDraft}
                  setExpertDraft={setExpertDraft}
                  busy={busy}
                  idSuffix={preview ? "-preview" : ""}
                />
              )}
            />
            <OnboardingActions
              showBack={questionnaireStep > 1}
              onBack={goBack}
              onContinue={goNext}
              busy={leavingStep != null}
            />
          </>
        )}

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

function QuestionnaireStepFields({
  stepId,
  draft,
  updateDraft,
  expertDraft,
  setExpertDraft,
  busy,
  idSuffix = ""
}: {
  stepId: SitterQuestionnaireStepId;
  draft: SitterOnboardingDraft;
  updateDraft: (patch: Partial<SitterOnboardingDraft>) => void;
  expertDraft: ExpertProfileDraft;
  setExpertDraft: (next: ExpertProfileDraft) => void;
  busy: boolean;
  idSuffix?: string;
}) {
  const homeCity = isIsraelCity(draft.homeCity) ? [draft.homeCity] : [];
  const fieldId = (id: string) => `${id}${idSuffix}`;
  const wrapperId = (id: string) => (idSuffix ? undefined : id);

  if (stepId === "about") {
    return (
      <div className="space-y-4">
        <OnboardingTextInput
          id={fieldId("sitter-first-name")}
          label="שם פרטי"
          required
          value={draft.firstName}
          onChange={(firstName) => updateDraft({ firstName })}
          autoComplete="given-name"
          maxLength={ONBOARDING_NAME_MAX_LENGTH}
        />
        <OnboardingTextInput
          id={fieldId("sitter-last-name")}
          label="שם משפחה"
          required
          value={draft.lastName}
          onChange={(lastName) => updateDraft({ lastName })}
          autoComplete="family-name"
          maxLength={ONBOARDING_NAME_MAX_LENGTH}
        />
        <OnboardingDateInput
          id={fieldId("sitter-birth-date")}
          label="תאריך לידה"
          required
          value={draft.birthDate}
          onChange={(birthDate) => updateDraft({ birthDate })}
          disallowFuture
        />
        <OnboardingTextInput
          id={fieldId("sitter-phone")}
          label="מספר טלפון"
          value={draft.phone}
          onChange={(phone) => updateDraft({ phone })}
          autoComplete="tel"
          inputMode="tel"
        />
        <div id={wrapperId("sitter-languages")}>
          <OnboardingChips
            legend="שפות"
            required
            options={SITTER_LANGUAGE_OPTIONS.map((value) => ({ value, label: value }))}
            value={draft.languages}
            onChange={(languages) => updateDraft({ languages })}
          />
        </div>
      </div>
    );
  }

  if (stepId === "location") {
    return (
      <div className="space-y-4">
        <div id={wrapperId("sitter-home-city")} className="space-y-1.5 text-right">
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
        <div id={wrapperId("sitter-work-area")} className="space-y-1.5 text-right">
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
      </div>
    );
  }

  if (stepId === "experience") {
    return (
      <div className="space-y-4">
        <OnboardingSelect
          id={fieldId("years-experience")}
          label="שנות ניסיון בבייביסיטר"
          required
          value={draft.yearsExperienceBand}
          onChange={(yearsExperienceBand) =>
            updateDraft({ yearsExperienceBand: yearsExperienceBand as SitterOnboardingDraft["yearsExperienceBand"] })
          }
          options={SITTER_EXPERIENCE_BAND_OPTIONS}
        />
        <div id={wrapperId("sitter-experience-ages")}>
          <OnboardingChips
            legend="עם אילו גילאים יש לך ניסיון?"
            required
            options={SITTER_AGE_GROUP_OPTIONS}
            value={draft.experienceAgeGroups}
            onChange={(experienceAgeGroups) => updateDraft({ experienceAgeGroups })}
          />
        </div>
        <OnboardingTextInput
          id={fieldId("hourly-rate")}
          label="מחיר לשעה"
          required
          value={draft.hourlyRateNis}
          onChange={(hourlyRateNis) => updateDraft({ hourlyRateNis })}
          inputMode="decimal"
        />
      </div>
    );
  }

  if (stepId === "skills") {
    return (
      <div className="space-y-4">
        <OnboardingYesNo
          name={`license${idSuffix}`}
          legend="האם יש לך רישיון נהיגה?"
          value={draft.hasDriversLicense}
          onChange={(hasDriversLicense) => updateDraft({ hasDriversLicense })}
        />
        <OnboardingYesNo
          name={`car${idSuffix}`}
          legend="האם יש לך רכב זמין?"
          value={draft.hasCar}
          onChange={(hasCar) => updateDraft({ hasCar })}
        />
        <OnboardingYesNo
          name={`smoking${idSuffix}`}
          legend="האם את מעשנת?"
          value={draft.isSmoker}
          onChange={(isSmoker) => updateDraft({ isSmoker })}
        />
        <OnboardingYesNo
          name={`baby${idSuffix}`}
          legend="האם יש לך ניסיון בטיפול בתינוקות?"
          value={draft.hasBabyExperience}
          onChange={(hasBabyExperience) => updateDraft({ hasBabyExperience })}
        />
        <OnboardingYesNo
          name={`multiple${idSuffix}`}
          legend="האם יש לך ניסיון בשמירה על כמה ילדים במקביל?"
          value={draft.hasMultipleChildrenExperience}
          onChange={(hasMultipleChildrenExperience) => updateDraft({ hasMultipleChildrenExperience })}
        />
      </div>
    );
  }

  if (stepId === "expert-profile") {
    return (
      <div className="space-y-4">
        <ExpertRegistrationFields value={expertDraft} onChange={setExpertDraft} compact />
      </div>
    );
  }

  if (stepId === "work-prefs") {
    return (
      <div className="space-y-4">
        <OnboardingSelect
          id={fieldId("current-status")}
          label="מה המסגרת העיקרית שלך כיום?"
          value={draft.currentStatus}
          onChange={(currentStatus) =>
            updateDraft({ currentStatus: currentStatus as SitterOnboardingDraft["currentStatus"] })
          }
          options={SITTER_CURRENT_STATUS_OPTIONS}
        />
        <OnboardingSelect
          id={fieldId("desired-hours")}
          label="כמה שעות בשבוע היית רוצה לעבוד דרך AnyNanny?"
          value={draft.desiredHoursPerWeek}
          onChange={(desiredHoursPerWeek) => updateDraft({ desiredHoursPerWeek })}
          options={HOURS_OPTIONS}
        />
        <OnboardingSelect
          id={fieldId("income-range")}
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
          id={fieldId("travel-distance")}
          label="כמה רחוק את מוכנה להגיע למשמרת?"
          value={draft.travelDistance}
          onChange={(travelDistance) =>
            updateDraft({ travelDistance: travelDistance as SitterOnboardingDraft["travelDistance"] })
          }
          options={SITTER_TRAVEL_DISTANCE_OPTIONS}
        />
        <OnboardingYesNo
          name={`short-notice${idSuffix}`}
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
      </div>
    );
  }

  if (stepId === "who") {
    return (
      <div className="space-y-4">
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
          name={`special-needs${idSuffix}`}
          legend="האם יש לך ניסיון עם ילדים עם צרכים מיוחדים?"
          value={draft.hasSpecialNeedsExperience}
          onChange={(hasSpecialNeedsExperience) => updateDraft({ hasSpecialNeedsExperience })}
        />
        {draft.hasSpecialNeedsExperience ? (
          <OnboardingTextInput
            id={fieldId("special-needs-details")}
            label="פירוט קצר"
            value={draft.specialNeedsExperienceDetails}
            onChange={(specialNeedsExperienceDetails) => updateDraft({ specialNeedsExperienceDetails })}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <OnboardingChips
        legend="אילו משימות מתאימות לך במסגרת שמרטפות?"
        options={SITTER_TASK_OPTIONS}
        value={draft.taskCapabilities}
        onChange={(taskCapabilities) => updateDraft({ taskCapabilities })}
      />
      <OnboardingYesNo
        name={`first-aid${idSuffix}`}
        legend="האם יש לך הכשרת עזרה ראשונה?"
        value={draft.hasFirstAidTraining}
        onChange={(hasFirstAidTraining) => updateDraft({ hasFirstAidTraining })}
      />
      <OnboardingYesNo
        name={`childcare-training${idSuffix}`}
        legend="האם עברת הכשרה רלוונטית לטיפול בילדים?"
        value={draft.hasChildcareTraining}
        onChange={(hasChildcareTraining) => updateDraft({ hasChildcareTraining })}
      />
      {draft.hasChildcareTraining ? (
        <OnboardingTextInput
          id={fieldId("training-details")}
          label="פירוט ההכשרה"
          value={draft.childcareTrainingDetails}
          onChange={(childcareTrainingDetails) => updateDraft({ childcareTrainingDetails })}
        />
      ) : null}
    </div>
  );
}