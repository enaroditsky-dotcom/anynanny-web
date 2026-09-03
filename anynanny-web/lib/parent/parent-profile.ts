export type ParentAddress = {
  city: string;
  street: string;
  houseNumber: string;
};

export type ParentSpouse = {
  firstName: string;
  lastName: string;
  birthDate: string;
};

export type ParentChild = {
  id: string;
  name: string;
  birthDate: string;
};

export type ParentSpecialEvent = {
  id: string;
  title: string;
  date: string;
};

export type ParentProfileData = {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  phone: string;
  avatar_url: string;
  address: ParentAddress;
  spouse: ParentSpouse | null;
  wedding_date: string;
  spouse_birthday: string;
  children: ParentChild[];
  children_count: number | null;
  special_events: ParentSpecialEvent[];
  preferred_language: string;
  typical_babysitting_need: string[];
  has_pets: boolean | null;
  pet_details: string;
  has_child_special_or_medical_information: boolean | null;
  child_special_or_medical_details: string;
  marital_status: string;
  estimated_babysitter_frequency: string;
  typical_reasons: string[];
  typical_reasons_other: string;
  reminder_preferences: string[];
  automatic_babysitter_suggestion: boolean | null;
};

const PARENT_QUESTIONNAIRE_SELECT =
  "preferred_language, typical_babysitting_need, has_pets, pet_details, has_child_special_or_medical_information, child_special_or_medical_details, marital_status, spouse_birthday, children_count, estimated_babysitter_frequency, typical_reasons, typical_reasons_other, reminder_preferences, automatic_babysitter_suggestion";

export const PARENT_PROFILE_SELECT =
  `id, first_name, last_name, birth_date, phone, avatar_url, address, city, spouse, wedding_date, children, special_events, ${PARENT_QUESTIONNAIRE_SELECT}` as const;

export const PARENT_PROFILE_SELECT_FALLBACKS = [
  PARENT_PROFILE_SELECT,
  `id, first_name, last_name, birth_date, phone, avatar_url, address, spouse, wedding_date, children, special_events, ${PARENT_QUESTIONNAIRE_SELECT}`,
  "id, first_name, last_name, birth_date, phone, avatar_url, address, spouse, wedding_date, children, special_events",
  "id, first_name, last_name, birth_date, phone, address, spouse, wedding_date, children, special_events",
  "id, first_name, last_name, birth_date, address, spouse, wedding_date, children, special_events",
  "id, first_name, last_name, birth_date, address, children",
  "id, first_name, last_name, birth_date, address",
  "id, first_name, last_name"
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

function asOptionalBoolean(value: unknown): boolean | null {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return null;
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function emptyParentAddress(): ParentAddress {
  return { city: "", street: "", houseNumber: "" };
}

export function emptyParentSpouse(): ParentSpouse {
  return { firstName: "", lastName: "", birthDate: "" };
}

export function parseParentAddress(raw: unknown): ParentAddress {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed ? { city: trimmed, street: "", houseNumber: "" } : emptyParentAddress();
  }
  const row = asRecord(raw);
  if (!row) return emptyParentAddress();
  return {
    city: asString(row.city ?? row.cityName ?? row.city_name),
    street: asString(row.street ?? row.streetName ?? row.street_name),
    houseNumber: asString(row.houseNumber ?? row.house_number ?? row.number ?? row.house)
  };
}

export function parseParentSpouse(raw: unknown): ParentSpouse | null {
  const row = asRecord(raw);
  if (!row) return null;
  const spouse: ParentSpouse = {
    firstName: asString(row.firstName ?? row.first_name),
    lastName: asString(row.lastName ?? row.last_name),
    birthDate: asString(row.birthDate ?? row.birth_date).slice(0, 10)
  };
  if (!spouse.firstName && !spouse.lastName && !spouse.birthDate) return null;
  return spouse;
}

export function parseParentChildren(raw: unknown): ParentChild[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const row = asRecord(item) ?? {};
    return {
      id: asString(row.id) || `child-${index}-${newId()}`,
      name: asString(row.name),
      birthDate: asString(row.birthDate ?? row.birth_date).slice(0, 10)
    };
  });
}

export function parseParentSpecialEvents(raw: unknown): ParentSpecialEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const row = asRecord(item) ?? {};
    return {
      id: asString(row.id) || `event-${index}-${newId()}`,
      title: asString(row.title ?? row.name),
      date: asString(row.date ?? row.eventDate ?? row.event_date).slice(0, 10)
    };
  });
}

export function parseParentProfileRow(raw: unknown, userId: string): ParentProfileData {
  const row = asRecord(raw) ?? {};
  const address = parseParentAddress(row.address);
  if (!address.city && asString(row.city)) {
    address.city = asString(row.city);
  }
  const spouse = parseParentSpouse(row.spouse);
  const spouseBirthday = asString(row.spouse_birthday).slice(0, 10);
  if (spouse && !spouse.birthDate && spouseBirthday) {
    spouse.birthDate = spouseBirthday;
  }
  const children = parseParentChildren(row.children);
  const childrenCountRaw =
    row.children_count != null && Number.isFinite(Number(row.children_count))
      ? Number(row.children_count)
      : null;

  return {
    id: asString(row.id) || userId,
    first_name: asString(row.first_name),
    last_name: asString(row.last_name),
    birth_date: asString(row.birth_date).slice(0, 10),
    phone: asString(row.phone ?? row.phone_number),
    avatar_url: asString(row.avatar_url),
    address,
    spouse,
    wedding_date: asString(row.wedding_date).slice(0, 10),
    spouse_birthday: spouseBirthday || spouse?.birthDate || "",
    children,
    children_count: childrenCountRaw,
    special_events: parseParentSpecialEvents(row.special_events),
    preferred_language: asString(row.preferred_language),
    typical_babysitting_need: asStringList(row.typical_babysitting_need),
    has_pets: asOptionalBoolean(row.has_pets),
    pet_details: asString(row.pet_details),
    has_child_special_or_medical_information: asOptionalBoolean(
      row.has_child_special_or_medical_information
    ),
    child_special_or_medical_details: asString(row.child_special_or_medical_details),
    marital_status: asString(row.marital_status),
    estimated_babysitter_frequency: asString(row.estimated_babysitter_frequency),
    typical_reasons: asStringList(row.typical_reasons),
    typical_reasons_other: asString(row.typical_reasons_other),
    reminder_preferences: asStringList(row.reminder_preferences),
    automatic_babysitter_suggestion: asOptionalBoolean(row.automatic_babysitter_suggestion)
  };
}

export function createEmptyChild(): ParentChild {
  return { id: newId(), name: "", birthDate: "" };
}

export function createEmptySpecialEvent(): ParentSpecialEvent {
  return { id: newId(), title: "", date: "" };
}

export function buildParentProfileUpdatePayload(data: ParentProfileData): Record<string, unknown> {
  const hasSpouse =
    Boolean(data.spouse) &&
    Boolean(
      data.spouse?.firstName.trim() || data.spouse?.lastName.trim() || data.spouse?.birthDate.trim()
    );

  const partnerBirth =
    data.spouse?.birthDate.trim() || data.spouse_birthday.trim() || "";
  const children = data.children.map((child) => ({
    id: child.id,
    name: child.name.trim(),
    birthDate: child.birthDate.trim()
  }));

  return {
    first_name: data.first_name.trim() || null,
    last_name: data.last_name.trim() || null,
    birth_date: data.birth_date.trim() || null,
    phone: data.phone.trim() || null,
    city: data.address.city.trim() || null,
    address: {
      city: data.address.city.trim(),
      street: data.address.street.trim(),
      houseNumber: data.address.houseNumber.trim()
    },
    spouse: hasSpouse
      ? {
          firstName: data.spouse!.firstName.trim(),
          lastName: data.spouse!.lastName.trim(),
          birthDate: data.spouse!.birthDate.trim() || null
        }
      : null,
    wedding_date: data.wedding_date.trim() || null,
    spouse_birthday: partnerBirth || null,
    children,
    children_count: children.length || data.children_count || null,
    special_events: data.special_events.map((event) => ({
      id: event.id,
      title: event.title.trim(),
      date: event.date.trim()
    })),
    preferred_language: data.preferred_language.trim() || null,
    typical_babysitting_need: data.typical_babysitting_need,
    has_pets: data.has_pets,
    pet_details: data.has_pets ? data.pet_details.trim() || null : null,
    has_child_special_or_medical_information: data.has_child_special_or_medical_information,
    child_special_or_medical_details: data.has_child_special_or_medical_information
      ? data.child_special_or_medical_details.trim() || null
      : null,
    marital_status: data.marital_status.trim() || null,
    estimated_babysitter_frequency: data.estimated_babysitter_frequency.trim() || null,
    typical_reasons: data.typical_reasons,
    typical_reasons_other: data.typical_reasons.includes("other")
      ? data.typical_reasons_other.trim() || null
      : null,
    reminder_preferences: data.reminder_preferences,
    automatic_babysitter_suggestion: data.automatic_babysitter_suggestion
  };
}
