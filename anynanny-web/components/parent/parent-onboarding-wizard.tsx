"use client";

import { useEffect, useState } from "react";
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
  PARENT_TYPICAL_NEED_OPTIONS
} from "@/lib/onboarding/parent-options";
import {
  buildParentOnboardingSavePayload,
  childBlocksForCount,
  createEmptyParentSpecialDate,
  emptyParentOnboardingDraft,
  validateParentOnboardingRequiredFields,
  validateParentOnboardingStep,
  type ParentOnboardingDraft
} from "@/lib/onboarding/parent-questionnaire";
import { replaceUserSpecialOccasions, updateRowStrippingUnknownColumns } from "@/lib/onboarding/persist";
import { ONBOARDING_NAME_MAX_LENGTH, ONBOARDING_STEP_COUNT } from "@/lib/onboarding/shared";
import { parseParentAddress, parseParentChildren, parseParentSpecialEvents } from "@/lib/parent/parent-profile";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

type Props = {
  onSaved?: () => void | Promise<void>;
};

export function ParentOnboardingWizard({ onSaved }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ParentOnboardingDraft>(emptyParentOnboardingDraft);
  const [verifyFormOpen, setVerifyFormOpen] = useState(false);

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

  const goNext = () => {
    const current = step as 1 | 2 | 3;
    const stepError = current <= 3 ? validateParentOnboardingStep(current, draft) : null;
    if (stepError) {
      setError(stepError);
      return;
    }
    setError(null);
    setStep((prev) => Math.min(ONBOARDING_STEP_COUNT, prev + 1));
  };

  const handleFinish = async () => {
    if (busy) return;
    const requiredError = validateParentOnboardingRequiredFields(draft);
    if (requiredError) {
      setError(requiredError);
      setStep(requiredError.includes("ילד") || requiredError.includes("בעלי חיים") || requiredError.includes("רפואי") ? 2 : 1);
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

  const selectedCity = isIsraelCity(draft.city) ? [draft.city] : [];

  return (
    <OnboardingPageShell>
      <OnboardingCard
        title="השאלון של AnyNanny"
        description={
          step === 3
            ? "עוד כמה פרטים שיעזרו ל-AnyNanny להתאים עבורכם תזכורות, הצעות ושירותים שימושיים. אפשר לדלג על שאלות שאינן רלוונטיות."
            : "נשלים כמה פרטים חיוניים כדי שנוכל להתאים לכם את השירות."
        }
        step={step}
        error={error}
      >
        {step === 1 ? (
          <div className="space-y-4">
            <OnboardingTextInput
              id="parent-first-name"
              label="שם פרטי"
              required
              value={draft.firstName}
              onChange={(firstName) => updateDraft({ firstName })}
              autoComplete="given-name"
              maxLength={ONBOARDING_NAME_MAX_LENGTH}
            />
            <OnboardingTextInput
              id="parent-last-name"
              label="שם משפחה"
              required
              value={draft.lastName}
              onChange={(lastName) => updateDraft({ lastName })}
              autoComplete="family-name"
              maxLength={ONBOARDING_NAME_MAX_LENGTH}
            />
            <OnboardingDateInput
              id="parent-birth-date"
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
                value={selectedCity}
                onChange={(cities) => updateDraft({ city: cities.slice(-1)[0] ?? "" })}
                disabled={busy}
                label="בחרו עיר"
              />
            </div>
            <OnboardingTextInput
              id="parent-phone"
              label="מספר טלפון"
              value={draft.phone}
              onChange={(phone) => updateDraft({ phone })}
              autoComplete="tel"
              inputMode="tel"
            />
            <OnboardingSelect
              id="parent-language"
              label="שפה מועדפת"
              required
              value={draft.preferredLanguage}
              onChange={(preferredLanguage) =>
                updateDraft({ preferredLanguage: preferredLanguage as ParentOnboardingDraft["preferredLanguage"] })
              }
              options={PARENT_LANGUAGE_OPTIONS.map((value) => ({ value, label: value }))}
            />
            <OnboardingActions showBack={false} onContinue={goNext} />
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
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
            {draft.childrenCount
              ? childBlocksForCount(draft.childrenCount, draft.children).map((child, index) => (
                  <div key={child.id} className="space-y-3 rounded-2xl border border-[#001F3F]/10 bg-[#FDFBF6] p-3">
                    <p className="text-sm font-bold text-[#001F3F]">ילד/ה {index + 1}</p>
                    <OnboardingTextInput
                      id={`child-first-name-${child.id}`}
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
                      id={`child-birth-date-${child.id}`}
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
            <OnboardingYesNo
              name="hasPets"
              legend="האם יש בעלי חיים בבית?"
              required
              value={draft.hasPets}
              onChange={(hasPets) => updateDraft({ hasPets, petDetails: hasPets ? draft.petDetails : "" })}
            />
            {draft.hasPets ? (
              <OnboardingTextInput
                id="pet-details"
                label="איזה בעלי חיים?"
                value={draft.petDetails}
                onChange={(petDetails) => updateDraft({ petDetails })}
              />
            ) : null}
            <OnboardingYesNo
              name="hasMedical"
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
            {draft.hasChildSpecialOrMedicalInformation ? (
              <OnboardingTextInput
                id="medical-details"
                label="פרטים שחשוב לדעת"
                required
                value={draft.childSpecialOrMedicalDetails}
                onChange={(childSpecialOrMedicalDetails) => updateDraft({ childSpecialOrMedicalDetails })}
              />
            ) : null}
            <OnboardingChips
              legend="מתי בדרך כלל אתם עשויים להזדקק לבייביסיטר?"
              options={PARENT_TYPICAL_NEED_OPTIONS}
              value={draft.typicalBabysittingNeed}
              onChange={(typicalBabysittingNeed) => updateDraft({ typicalBabysittingNeed })}
            />
            <OnboardingActions onBack={() => setStep(1)} onContinue={goNext} />
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <OnboardingSelect
              id="marital-status"
              label="מצב משפחתי"
              value={draft.maritalStatus}
              onChange={(maritalStatus) =>
                updateDraft({ maritalStatus: maritalStatus as ParentOnboardingDraft["maritalStatus"] })
              }
              options={PARENT_MARITAL_STATUS_OPTIONS}
            />
            <OnboardingDateInput
              id="wedding-anniversary"
              label="מתי יום הנישואין שלכם?"
              value={draft.weddingAnniversary}
              onChange={(weddingAnniversary) => updateDraft({ weddingAnniversary })}
            />
            <OnboardingDateInput
              id="partner-dob"
              label="תאריך הלידה של בן/בת הזוג"
              value={draft.partnerDateOfBirth}
              onChange={(partnerDateOfBirth) => updateDraft({ partnerDateOfBirth })}
              disallowFuture
            />
            <div className="space-y-2">
              <p className="text-sm font-semibold text-[#001F3F]">יש תאריכים משפחתיים נוספים שתרצו שנזכור?</p>
              {draft.specialDates.map((event) => (
                <div key={event.id} className="space-y-2 rounded-2xl border border-[#001F3F]/10 bg-[#FDFBF6] p-3">
                  <OnboardingTextInput
                    id={`event-title-${event.id}`}
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
                    id={`event-date-${event.id}`}
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
            <OnboardingSelect
              id="frequency"
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
                id="reason-other"
                label="פירוט נוסף"
                value={draft.typicalReasonsOther}
                onChange={(typicalReasonsOther) => updateDraft({ typicalReasonsOther })}
              />
            ) : null}
            <OnboardingChips
              legend="על אילו אירועים תרצו ש-AnyNanny תזכיר לכם?"
              options={PARENT_REMINDER_OPTIONS}
              value={draft.reminderPreferences}
              onChange={(reminderPreferences) => updateDraft({ reminderPreferences })}
            />
            <OnboardingYesNo
              name="autoSuggest"
              legend="האם תרצו ש-AnyNanny תציע לכם למצוא בייביסיטר לקראת אירועים חשובים?"
              value={draft.automaticBabysitterSuggestion}
              onChange={(automaticBabysitterSuggestion) => updateDraft({ automaticBabysitterSuggestion })}
            />
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
