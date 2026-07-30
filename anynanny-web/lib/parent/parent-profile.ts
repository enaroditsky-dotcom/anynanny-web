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
  address: ParentAddress;
  spouse: ParentSpouse | null;
  wedding_date: string;
  children: ParentChild[];
  special_events: ParentSpecialEvent[];
};

export const PARENT_PROFILE_SELECT =
  "id, first_name, last_name, birth_date, phone, address, spouse, wedding_date, children, special_events" as const;

export const PARENT_PROFILE_SELECT_FALLBACKS = [
  PARENT_PROFILE_SELECT,
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
  return {
    id: asString(row.id) || userId,
    first_name: asString(row.first_name),
    last_name: asString(row.last_name),
    birth_date: asString(row.birth_date).slice(0, 10),
    phone: asString(row.phone ?? row.phone_number),
    address: parseParentAddress(row.address),
    spouse: parseParentSpouse(row.spouse),
    wedding_date: asString(row.wedding_date).slice(0, 10),
    children: parseParentChildren(row.children),
    special_events: parseParentSpecialEvents(row.special_events)
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

  return {
    first_name: data.first_name.trim() || null,
    last_name: data.last_name.trim() || null,
    birth_date: data.birth_date.trim() || null,
    phone: data.phone.trim() || null,
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
    children: data.children.map((child) => ({
      id: child.id,
      name: child.name.trim(),
      birthDate: child.birthDate.trim()
    })),
    special_events: data.special_events.map((event) => ({
      id: event.id,
      title: event.title.trim(),
      date: event.date.trim()
    }))
  };
}
