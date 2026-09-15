"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { isIsraelCity } from "@/lib/geo/israel-cities";
import {
  PARENT_CHILDREN_COUNT_OPTIONS,
  PARENT_FREQUENCY_OPTIONS,
  PARENT_LANGUAGE_OPTIONS,
  PARENT_MARITAL_STATUS_OPTIONS,
  PARENT_REASON_OPTIONS,
  PARENT_REMINDER_OPTIONS,
  PARENT_TYPICAL_NEED_OPTIONS,
  parentShowsPartnerDateOfBirth,
  parentShowsWeddingAnniversary,
  parentSpouseDateFieldsForStatus
} from "@/lib/onboarding/parent-options";
import {
  buildParentOnboardingSavePayload,
  childBlocksForCount,
  createEmptyParentSpecialDate,
  emptyParentOnboardingDraft,
  firstInvalidParentOnboardingFieldId,
  PARENT_QUESTIONNAIRE_STEP_COUNT,
  PARENT_QUESTIONNAIRE_STEP_DESCRIPTIONS,
  PARENT_QUESTIONNAIRE_STEP_TITLES,
  parentQuestionnaireStepForRequiredError,
  validateParentOnboardingRequiredFields,
  validateParentOnboardingStep,
  type ParentOnboardingDraft,
  type ParentQuestionnaireStep
} from "@/lib/onboarding/parent-questionnaire";
import { replaceUserSpecialOccasions, updateRowStrippingUnknownColumns } from "@/lib/onboarding/persist";
import { ONBOARDING_NAME_MAX_LENGTH, ONBOARDING_STEP_COUNT } from "@/lib/onboarding/shared";
import {
  parseParentAddress,
  parseParentChildren,
  parseParentSpecialEvents
} from "@/lib/parent/parent-profile";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

type Props = {
  onSaved?: () => void | Promise<void>;
};

type SlideDirection = "forward" | "back";

const SLIDE_MS = 280;
const QUESTIONNAIRE_TITLE_ID = "parent-questionnaire-step-title";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

function focusStepTarget(fieldId: string | null) {
  const heading = document.getElementById(QUESTIONNAIRE_TITLE_ID);
  if (!fieldId) {
    heading?.focus();
    return;
  }
  const field = document.getElementById(fieldId);
  if (field instanceof HTMLElement) {
    field.focus();
    return;
  }
  if (fieldId === "parent-city") {
    document.querySelector<HTMLElement>("#parent-city input")?.focus();
    return;
  }
  const wrapper = document.getElementById(fieldId);
  if (wrapper) {
    wrapper.querySelector<HTMLElement>("button, input, select")?.focus();
    return;
  }
  heading?.focus();
}

export function ParentOnboardingWizard({ onSaved }: Props) {
  const router = useRouter();
  const [questionnaireStep, setQuestionnaireStep] = useState<ParentQuestionnaireStep>(1);
  const [showIdentity, setShowIdentity] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ParentOnboardingDraft>(emptyParentOnboardingDraft);
  const [verifyFormOpen, setVerifyFormOpen] = useState(false);
  const [direction, setDirection] = useState<SlideDirection>("forward");
  const [renderedStep, setRenderedStep] = useState<ParentQuestionnaireStep>(1);
  const [leavingStep, setLeavingStep] = useState<ParentQuestionnaireStep | null>(null);
  const reduceMotion = usePrefersReducedMotion();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const skipNextFocusRef = useRef(false);
  const hasNavigatedRef = useRef(false);

  const updateDraft = (patch: Partial<ParentOnboardingDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  useEffect(() => {
    void (async () => {
      const auth = await resolveBrowserAuth();
      const cached = readSignupNamesFromDevice();
      if (!auth.ok || !auth.supabase || !auth.userId) {
        if (cached) {
          updateDraft({ firstName: cached.first_name, lastName: cached.last_name });
        }
        return;
      }

      const {
        data: { user }
      } = await auth.supabase.auth.getUser();
      const { data: profileRow } = await auth.supabase
        .from(PROFILES_TABLE)
        .select(
          "first_name, last_name, birth_date, phone, address, children, special_events, preferred_language"
        )
        .eq("id", auth.userId)
        .maybeSingle();

      const resolved = coalesceSignupNames(
        profileRow,
        namesFromUserMetadata(user?.user_metadata as Record<string, unknown> | undefined),
        cached
      );
      if (hasCompleteSignupNames(resolved)) saveSignupNamesToDevice(resolved);

      const address = parseParentAddress(profileRow?.address);
      const children = parseParentChildren(profileRow?.children);
      updateDraft({
        firstName: resolved.first_name,
        lastName: resolved.last_name,
        birthDate: typeof profileRow?.birth_date === "string" ? profileRow.birth_date.slice(0, 10) : "",
        city: address.city,
        street: address.street,
        houseNumber: address.houseNumber,
        phone: typeof profileRow?.phone === "string" ? profileRow.phone : "",
        children: children.length ? children : [],
        childrenCount: children.length
          ? ((Math.min(6, children.length) || null) as ParentOnboardingDraft["childrenCount"])
          : null,
        specialDates: parseParentSpecialEvents(profileRow?.special_events),
        preferredLanguage:
          typeof profileRow?.preferred_language === "string"
            ? (profileRow.preferred_language as ParentOnboardingDraft["preferredLanguage"])
            : ""
      });
    })();
  }, []);

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
    }, SLIDE_MS);
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
    const stepError = validateParentOnboardingStep(questionnaireStep, draft);
    if (stepError) {
      setError(stepError);
      skipNextFocusRef.current = true;
      window.requestAnimationFrame(() => {
        focusStepTarget(firstInvalidParentOnboardingFieldId(questionnaireStep, draft));
      });
      return;
    }
    setError(null);
    if (questionnaireStep === PARENT_QUESTIONNAIRE_STEP_COUNT) {
      setShowIdentity(true);
      return;
    }
    hasNavigatedRef.current = true;
    setDirection("forward");
    setQuestionnaireStep((prev) => (prev + 1) as ParentQuestionnaireStep);
  };

  const goBack = () => {
    setError(null);
    if (showIdentity) {
      setShowIdentity(false);
      setDirection("back");
      setQuestionnaireStep(PARENT_QUESTIONNAIRE_STEP_COUNT);
      return;
    }
    if (questionnaireStep === 1) return;
    hasNavigatedRef.current = true;
    setDirection("back");
    setQuestionnaireStep((prev) => (prev - 1) as ParentQuestionnaireStep);
  };

  const handleFinish = async () => {
    if (busy) return;
    const requiredError = validateParentOnboardingRequiredFields(draft);
    if (requiredError) {
      setError(requiredError);
      setShowIdentity(false);
      setQuestionnaireStep(parentQuestionnaireStepForRequiredError(requiredError));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const auth = await resolveBrowserAuth();
      if (!auth.ok || !auth.supabase || !auth.userId) {
        setError("יש להתחבר מחדש כדי לסיים את השאלון.");
        setBusy(false);
        return;
      }

      const payload = buildParentOnboardingSavePayload(draft);
      const saved = await updateRowStrippingUnknownColumns(
        auth.supabase,
        PROFILES_TABLE,
        "id",
        auth.userId,
        payload
      );
      if (saved.error) {
        setError("שגיאה בשמירה: " + saved.error);
        setBusy(false);
        return;
      }

      const specialDates = Array.isArray(payload.special_events)
        ? (payload.special_events as { id: string; title: string; date: string }[])
        : [];
      await replaceUserSpecialOccasions(auth.supabase, auth.userId, specialDates).catch(() => undefined);

      await onSaved?.();
      clearSecondRoleInProgress(auth.userId, "parent");
      router.replace("/parent/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה.");
    } finally {
      setBusy(false);
    }
  };

  const innerProgress = showIdentity
    ? null
    : { current: questionnaireStep, total: PARENT_QUESTIONNAIRE_STEP_COUNT };

  return (
    <OnboardingPageShell>
      <OnboardingCard
        title={
          showIdentity ? "השאלון של AnyNanny" : PARENT_QUESTIONNAIRE_STEP_TITLES[questionnaireStep]
        }
        description={
          showIdentity
            ? "אפשר לאמת עכשיו או להשלים את זה מאוחר יותר מהאזור האישי."
            : PARENT_QUESTIONNAIRE_STEP_DESCRIPTIONS[questionnaireStep]
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
          <div className="relative overflow-hidden">
            {leavingStep != null && !reduceMotion ? (
              <div
                className={`pointer-events-none absolute inset-0 ${
                  direction === "forward"
                    ? "animate-parent-wizard-out-forward"
                    : "animate-parent-wizard-out-back"
                }`}
                aria-hidden
              >
                <QuestionnaireStepFields
                  step={leavingStep}
                  draft={draft}
                  updateDraft={updateDraft}
                  idSuffix="-preview"
                />
              </div>
            ) : null}
            <div
              className={
                reduceMotion
                  ? undefined
                  : leavingStep != null
                    ? "invisible"
                    : !hasNavigatedRef.current
                      ? undefined
                      : direction === "forward"
                        ? "animate-parent-wizard-in-forward"
                        : "animate-parent-wizard-in-back"
              }
            >
              <QuestionnaireStepFields
                step={questionnaireStep}
                draft={draft}
                updateDraft={updateDraft}
              />
            </div>
          </div>
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
          role="parent"
          nextPath="/parent/profile"
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
  step,
  draft,
  updateDraft,
  idSuffix = ""
}: {
  step: ParentQuestionnaireStep;
  draft: ParentOnboardingDraft;
  updateDraft: (patch: Partial<ParentOnboardingDraft>) => void;
  idSuffix?: string;
}) {
  const selectedCity = isIsraelCity(draft.city) ? [draft.city] : [];
  const fieldId = (id: string) => `${id}${idSuffix}`;

  if (step === 1) {
    return (
      <div className="space-y-4">
        <OnboardingTextInput
          id={fieldId("parent-first-name")}
          label="שם פרטי"
          required
          value={draft.firstName}
          onChange={(firstName) => updateDraft({ firstName })}
          autoComplete="given-name"
          maxLength={ONBOARDING_NAME_MAX_LENGTH}
        />
        <OnboardingTextInput
          id={fieldId("parent-last-name")}
          label="שם משפחה"
          required
          value={draft.lastName}
          onChange={(lastName) => updateDraft({ lastName })}
          autoComplete="family-name"
          maxLength={ONBOARDING_NAME_MAX_LENGTH}
        />
        <OnboardingDateInput
          id={fieldId("parent-birth-date")}
          label="תאריך לידה"
          required
          value={draft.birthDate}
          onChange={(birthDate) => updateDraft({ birthDate })}
          disallowFuture
        />
        <OnboardingTextInput
          id={fieldId("parent-phone")}
          label="מספר טלפון"
          value={draft.phone}
          onChange={(phone) => updateDraft({ phone })}
          autoComplete="tel"
          inputMode="tel"
        />
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="space-y-4">
        <div id={idSuffix ? undefined : "parent-city"} className="space-y-1.5 text-right">
          <p className="text-sm font-semibold text-[#001F3F]">
            עיר / אזור מגורים
            <span className="ms-1 text-teal-700" aria-hidden>
              *
            </span>
            <span className="sr-only"> (שדה חובה)</span>
          </p>
          <IsraelCitiesMultiSelect
            value={selectedCity}
            onChange={(cities) => updateDraft({ city: cities.slice(-1)[0] ?? "" })}
            label="בחרו עיר"
          />
        </div>
        <OnboardingTextInput
          id={fieldId("parent-street")}
          label="רחוב"
          value={draft.street}
          onChange={(street) => updateDraft({ street })}
          autoComplete="address-line1"
        />
        <OnboardingTextInput
          id={fieldId("parent-house-number")}
          label="מספר בית"
          value={draft.houseNumber}
          onChange={(houseNumber) => updateDraft({ houseNumber })}
          autoComplete="address-line2"
        />
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="space-y-4">
        <OnboardingSelect
          id={fieldId("marital-status")}
          label="מצב משפחתי"
          value={draft.maritalStatus}
          onChange={(maritalStatus) => {
            const nextStatus = maritalStatus as ParentOnboardingDraft["maritalStatus"];
            updateDraft({
              maritalStatus: nextStatus,
              ...parentSpouseDateFieldsForStatus(nextStatus, {
                weddingAnniversary: draft.weddingAnniversary,
                partnerDateOfBirth: draft.partnerDateOfBirth
              })
            });
          }}
          options={PARENT_MARITAL_STATUS_OPTIONS}
        />
        {parentShowsWeddingAnniversary(draft.maritalStatus) ? (
          <OnboardingDateInput
            id={fieldId("wedding-anniversary")}
            label="מתי יום הנישואין שלכם?"
            value={draft.weddingAnniversary}
            onChange={(weddingAnniversary) => updateDraft({ weddingAnniversary })}
          />
        ) : null}
        {parentShowsPartnerDateOfBirth(draft.maritalStatus) ? (
          <OnboardingDateInput
            id={fieldId("partner-dob")}
            label="תאריך הלידה של בן/בת הזוג"
            value={draft.partnerDateOfBirth}
            onChange={(partnerDateOfBirth) => updateDraft({ partnerDateOfBirth })}
            disallowFuture
          />
        ) : null}
      </div>
    );
  }

  if (step === 4) {
    return (
      <div className="space-y-4">
        <div id={idSuffix ? undefined : "parent-children-count"}>
          <OnboardingChoiceRow
            legend="כמה ילדים יש במשפחה?"
            required
            value={draft.childrenCount}
            onChange={(childrenCount) =>
              updateDraft({
                childrenCount,
                children: childBlocksForCount(childrenCount, draft.children)
              })
            }
            options={PARENT_CHILDREN_COUNT_OPTIONS.map((value) => ({
              value,
              label: value === 6 ? "6+" : String(value)
            }))}
          />
        </div>
        {draft.childrenCount
          ? childBlocksForCount(draft.childrenCount, draft.children).map((child, index) => (
              <div key={child.id} className="space-y-3 rounded-2xl border border-[#001F3F]/10 bg-[#FDFBF6] p-3">
                <p className="text-sm font-bold text-[#001F3F]">ילד/ה {index + 1}</p>
                <OnboardingTextInput
                  id={fieldId(`child-first-name-${child.id}`)}
                  label="שם פרטי"
                  required
                  value={child.name}
                  onChange={(name) =>
                    updateDraft({
                      children: childBlocksForCount(draft.childrenCount!, draft.children).map((item) =>
                        item.id === child.id ? { ...item, name } : item
                      )
                    })
                  }
                  maxLength={ONBOARDING_NAME_MAX_LENGTH}
                />
                <OnboardingDateInput
                  id={fieldId(`child-birth-date-${child.id}`)}
                  label="תאריך לידה"
                  required
                  value={child.birthDate}
                  onChange={(birthDate) =>
                    updateDraft({
                      children: childBlocksForCount(draft.childrenCount!, draft.children).map((item) =>
                        item.id === child.id ? { ...item, birthDate } : item
                      )
                    })
                  }
                  disallowFuture
                />
              </div>
            ))
          : null}
        {draft.childrenCount === 6 ? (
          <button
            type="button"
            onClick={() =>
              updateDraft({
                children: [
                  ...childBlocksForCount(6, draft.children),
                  { id: crypto.randomUUID(), name: "", birthDate: "" }
                ]
              })
            }
            className="min-h-11 w-full rounded-2xl border border-teal-700/30 text-sm font-bold text-teal-800"
          >
            + הוספת ילד/ה
          </button>
        ) : null}
      </div>
    );
  }

  if (step === 5) {
    return (
      <div className="space-y-4">
        <div id={idSuffix ? undefined : "parent-has-pets"}>
          <OnboardingYesNo
            name={fieldId("hasPets")}
            legend="האם יש בעלי חיים בבית?"
            required
            value={draft.hasPets}
            onChange={(hasPets) => updateDraft({ hasPets, petDetails: hasPets ? draft.petDetails : "" })}
          />
        </div>
        {draft.hasPets ? (
          <OnboardingTextInput
            id={fieldId("pet-details")}
            label="איזה בעלי חיים?"
            value={draft.petDetails}
            onChange={(petDetails) => updateDraft({ petDetails })}
          />
        ) : null}
        <div id={idSuffix ? undefined : "parent-has-medical"}>
          <OnboardingYesNo
            name={fieldId("hasMedical")}
            legend="האם יש לילד/ה אלרגיה, מצב רפואי, צורך מיוחד או מידע אחר שחשוב שבייביסיטר תדע?"
            required
            value={draft.hasChildSpecialOrMedicalInformation}
            onChange={(hasChildSpecialOrMedicalInformation) =>
              updateDraft({
                hasChildSpecialOrMedicalInformation,
                childSpecialOrMedicalDetails: hasChildSpecialOrMedicalInformation
                  ? draft.childSpecialOrMedicalDetails
                  : ""
              })
            }
          />
        </div>
        {draft.hasChildSpecialOrMedicalInformation ? (
          <OnboardingTextInput
            id={fieldId("medical-details")}
            label="פרטים שחשוב לדעת"
            required
            value={draft.childSpecialOrMedicalDetails}
            onChange={(childSpecialOrMedicalDetails) => updateDraft({ childSpecialOrMedicalDetails })}
          />
        ) : null}
      </div>
    );
  }

  if (step === 6) {
    return (
      <div className="space-y-4">
        <OnboardingSelect
          id={fieldId("parent-language")}
          label="שפה מועדפת"
          required
          value={draft.preferredLanguage}
          onChange={(preferredLanguage) =>
            updateDraft({ preferredLanguage: preferredLanguage as ParentOnboardingDraft["preferredLanguage"] })
          }
          options={PARENT_LANGUAGE_OPTIONS.map((value) => ({ value, label: value }))}
        />
        <OnboardingChips
          legend="מתי בדרך כלל אתם עשויים להזדקק לבייביסיטר?"
          options={PARENT_TYPICAL_NEED_OPTIONS}
          value={draft.typicalBabysittingNeed}
          onChange={(typicalBabysittingNeed) => updateDraft({ typicalBabysittingNeed })}
        />
        <OnboardingSelect
          id={fieldId("frequency")}
          label="באיזו תדירות אתם מעריכים שתשתמשו בבייביסיטר?"
          value={draft.estimatedBabysitterFrequency}
          onChange={(estimatedBabysitterFrequency) =>
            updateDraft({
              estimatedBabysitterFrequency:
                estimatedBabysitterFrequency as ParentOnboardingDraft["estimatedBabysitterFrequency"]
            })
          }
          options={PARENT_FREQUENCY_OPTIONS}
        />
        <OnboardingChips
          legend="לאילו צרכים אתם בדרך כלל מחפשים בייביסיטר?"
          options={PARENT_REASON_OPTIONS}
          value={draft.typicalReasons}
          onChange={(typicalReasons) => updateDraft({ typicalReasons })}
        />
        {draft.typicalReasons.includes("other") ? (
          <OnboardingTextInput
            id={fieldId("reason-other")}
            label="פירוט נוסף"
            value={draft.typicalReasonsOther}
            onChange={(typicalReasonsOther) => updateDraft({ typicalReasonsOther })}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-[#001F3F]">יש תאריכים משפחתיים נוספים שתרצו שנזכור?</p>
        {draft.specialDates.map((event) => (
          <div key={event.id} className="space-y-2 rounded-2xl border border-[#001F3F]/10 bg-[#FDFBF6] p-3">
            <OnboardingTextInput
              id={fieldId(`event-title-${event.id}`)}
              label="שם האירוע"
              value={event.title}
              onChange={(title) =>
                updateDraft({
                  specialDates: draft.specialDates.map((item) =>
                    item.id === event.id ? { ...item, title } : item
                  )
                })
              }
            />
            <OnboardingDateInput
              id={fieldId(`event-date-${event.id}`)}
              label="תאריך"
              value={event.date}
              onChange={(date) =>
                updateDraft({
                  specialDates: draft.specialDates.map((item) =>
                    item.id === event.id ? { ...item, date } : item
                  )
                })
              }
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => updateDraft({ specialDates: [...draft.specialDates, createEmptyParentSpecialDate()] })}
          className="min-h-11 w-full rounded-2xl border border-teal-700/30 text-sm font-bold text-teal-800"
        >
          + הוספת תאריך
        </button>
      </div>
      <OnboardingChips
        legend="על אילו אירועים תרצו ש-AnyNanny תזכיר לכם?"
        options={PARENT_REMINDER_OPTIONS}
        value={draft.reminderPreferences}
        onChange={(reminderPreferences) => updateDraft({ reminderPreferences })}
      />
      <OnboardingYesNo
        name={fieldId("autoSuggest")}
        legend="האם תרצו ש-AnyNanny תציע לכם למצוא בייביסיטר לקראת אירועים חשובים?"
        value={draft.automaticBabysitterSuggestion}
        onChange={(automaticBabysitterSuggestion) => updateDraft({ automaticBabysitterSuggestion })}
      />
    </div>
  );
}
