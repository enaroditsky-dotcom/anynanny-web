import { getAccountDobEligibilityError } from "@/lib/auth/age-eligibility";
import type { ParentChild, ParentSpecialEvent } from "@/lib/parent/parent-profile";

export const PARENT_ONBOARDING_ADDRESS_ERROR =
  "יש להזין כתובת מלאה ומובנית (עיר, רחוב ומספר בית).";

export type ParentOnboardingNamePair = {
  first_name: string;
  last_name: string;
};

/**
 * Signup already stored first/last name. Only echo a complete pair.
 * Empty/partial names are omitted so completion cannot overwrite signup data.
 */
function safeName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parentOnboardingNamePatch(
  names: ParentOnboardingNamePair
): Partial<ParentOnboardingNamePair> {
  const first_name = safeName(names.first_name);
  const last_name = safeName(names.last_name);
  if (!first_name || !last_name) return {};
  return { first_name, last_name };
}

export function validateParentOnboardingRequiredFields(input: {
  city: string | null | undefined;
  street: string;
  houseNumber: string;
  birthDate: string;
}): string | null {
  const city = typeof input.city === "string" ? input.city.trim() : "";
  if (!city || !input.street.trim() || !input.houseNumber.trim()) {
    return PARENT_ONBOARDING_ADDRESS_ERROR;
  }
  return getAccountDobEligibilityError("parent", input.birthDate);
}

export type ParentOnboardingSaveInput = {
  firstName: string;
  lastName: string;
  birthDate: string;
  city: string;
  street: string;
  houseNumber: string;
  hasSpouse: boolean;
  spouseFirstName: string;
  spouseLastName: string;
  spouseBirthDate: string;
  weddingDate: string;
  children: ParentChild[];
  specialEvents: ParentSpecialEvent[];
  completedAt?: string;
};

export function buildParentOnboardingSavePayload(
  input: ParentOnboardingSaveInput
): Record<string, unknown> {
  return {
    ...parentOnboardingNamePatch({
      first_name: input.firstName,
      last_name: input.lastName
    }),
    birth_date: input.birthDate || null,
    address: {
      city: input.city.trim(),
      street: input.street.trim(),
      houseNumber: input.houseNumber.trim()
    },
    spouse: input.hasSpouse
      ? {
          firstName: input.spouseFirstName.trim(),
          lastName: input.spouseLastName.trim(),
          birthDate: input.spouseBirthDate || null
        }
      : null,
    wedding_date: input.weddingDate || null,
    children: input.children,
    special_events: input.specialEvents,
    parent_onboarding_completed_at: input.completedAt ?? new Date().toISOString()
  };
}
