/**
 * AnyNanny NOW request details shown to a responding nanny.
 *
 * Timing comes only from stored request fields. created_at is never treated as ASAP.
 * Location is street + house number + city. Apartment, floor, door code, and entry notes stay out.
 */

export const NOW_TIMING_ASAP = "asap" as const;
export const NOW_TIMING_SPECIFIC = "specific_time" as const;

export const NOW_ARRIVAL_RANGES = [
  "within_15_min",
  "within_30_min",
  "within_30_60_min"
] as const;

export type NowTimingMode = typeof NOW_TIMING_ASAP | typeof NOW_TIMING_SPECIFIC;
export type NowArrivalRange = (typeof NOW_ARRIVAL_RANGES)[number];
export type NowResponseKind = "specific_time" | "asap" | "legacy";

export const ASAP_TIMING_LABEL = "בהקדם האפשרי";
export const SPECIFIC_TIME_ACCEPT_LABEL =
  "היי, אני פנויה ויכולה להגיע בשעה שביקשת";
export const LEGACY_ACCEPT_LABEL = "אני פנויה, הציגו אותי להורה!";
export const ARRIVAL_PROMPT_LABEL = "מתי תוכלי להגיע? ▾";
export const ARRIVAL_PROMPT_OPEN_LABEL = "מתי תוכלי להגיע? ▴";
export const NOW_DISMISS_LABEL = "התעלם / לא רלוונטי";

export const NOW_ARRIVAL_OPTIONS: readonly {
  value: NowArrivalRange;
  label: string;
}[] = [
  {
    value: "within_15_min",
    label: "היי, אני יכולה להגיע תוך 15 דקות"
  },
  {
    value: "within_30_min",
    label: "היי, אני יכולה להגיע תוך 30 דקות"
  },
  {
    value: "within_30_60_min",
    label: "היי, אני יכולה להגיע בין 30 דקות לשעה"
  }
];

export const SITTER_BROADCAST_ALERT_SELECT =
  "id, city, service_type, status, created_at, location_label, timing_mode, requested_time";

export const SITTER_BROADCAST_ALERT_SELECT_LEGACY =
  "id, city, service_type, status, created_at";

const REQUESTED_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

export type ParsedNowRequest = {
  locationLabel: string | null;
  timingMode: NowTimingMode | null;
  requestedTimeLabel: string | null;
  /** Visible "מועד נדרש" value. Null when the request has no stored timing. */
  timingLabel: string | null;
  responseKind: NowResponseKind;
};

export type NowTimingChoice =
  | { ok: true; timingMode: typeof NOW_TIMING_ASAP; requestedTime: null }
  | { ok: true; timingMode: typeof NOW_TIMING_SPECIFIC; requestedTime: string }
  | { ok: false; message: string };

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** HH:MM from a stored clock value. Rejects words like "now", "asap", and AM/PM. */
export function normalizeRequestedTime(raw: unknown): string | null {
  const text = readText(raw);
  if (/[ap]\.?m\.?/i.test(text)) return null;
  const match = REQUESTED_TIME_PATTERN.exec(text);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

function clockDigits(raw: string, maxLength: number): string {
  return raw.replace(/\D/g, "").slice(0, maxLength);
}

/** Build a stored HH:MM value from 24-hour parts. Single digits are padded. */
export function composeNowRequestedTime(hourRaw: string, minuteRaw: string): string | null {
  const hourDigits = clockDigits(hourRaw, 2);
  const minuteDigits = clockDigits(minuteRaw, 2);
  if (!hourDigits || !minuteDigits) return null;
  return normalizeRequestedTime(
    `${hourDigits.padStart(2, "0")}:${minuteDigits.padStart(2, "0")}`
  );
}

/**
 * Visible HH:MM draft. Digits are kept in order, so a two-digit hour stays intact
 * until minutes are typed. Letters, including AM/PM, are dropped.
 */
export function formatNowClockInput(raw: string): string {
  const text = String(raw ?? "");
  if (text.includes(":")) {
    const colon = text.indexOf(":");
    const hour = text.slice(0, colon).replace(/\D/g, "").slice(0, 2);
    const minute = text.slice(colon + 1).replace(/\D/g, "").slice(0, 2);
    if (minute.length > 0 || text.slice(colon).startsWith(":")) {
      return `${hour}:${minute}`;
    }
    return hour;
  }

  const digits = text.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export const NOW_PAST_TIME_MESSAGE = "יש לבחור שעה שעדיין לא חלפה";
export const NOW_SOON_RECOMMENDATION_TITLE = "השעה שבחרת קרובה מאוד.";
export const NOW_SOON_RECOMMENDATION_BODY =
  "אולי כדאי לבחור באופציה 'בהקדם האפשרי' כדי לקבל מענה מהיר יותר?";
export const NOW_SWITCH_TO_ASAP_LABEL = "לעבור לבהקדם האפשרי";
/** Inclusive. 61 minutes ahead does not recommend ASAP. */
export const NOW_ASAP_RECOMMENDATION_WINDOW_MINUTES = 60;

export function nowKeepSpecificTimeLabel(time: string): string {
  return `להישאר עם ${time}`;
}

export type NowSpecificTimeProximity =
  | { kind: "invalid" }
  | { kind: "past" }
  | { kind: "soon"; requestedTime: string; minutesAhead: number }
  | { kind: "later"; requestedTime: string; minutesAhead: number };

/**
 * Compare a today-only HH:MM with the user's local clock.
 * Both sides are local datetimes truncated to the minute. No UTC conversion.
 * Same minute or earlier is past. 1–60 minutes ahead is soon. 61+ is later.
 */
export function classifyNowSpecificTime(requestedTime: unknown, now: Date): NowSpecificTimeProximity {
  const normalized = normalizeRequestedTime(requestedTime);
  if (!normalized) return { kind: "invalid" };
  const [hourText, minuteText] = normalized.split(":");
  const selected = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Number(hourText),
    Number(minuteText),
    0,
    0
  );
  const currentMinute = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    0,
    0
  );
  const minutesAhead = (selected.getTime() - currentMinute.getTime()) / 60_000;
  if (minutesAhead <= 0) return { kind: "past" };
  if (minutesAhead <= NOW_ASAP_RECOMMENDATION_WINDOW_MINUTES) {
    return { kind: "soon", requestedTime: normalized, minutesAhead };
  }
  return { kind: "later", requestedTime: normalized, minutesAhead };
}

export type NowSubmitGate =
  | { action: "invalid"; message: string }
  | { action: "block_past"; message: typeof NOW_PAST_TIME_MESSAGE }
  | { action: "recommend_asap"; requestedTime: string }
  | { action: "send"; timingMode: typeof NOW_TIMING_ASAP; requestedTime: null }
  | { action: "send"; timingMode: typeof NOW_TIMING_SPECIFIC; requestedTime: string };

/** Local gate used before a NOW request is sent. ASAP skips the clock check. */
export function resolveNowSubmitGate(input: {
  timingMode: unknown;
  requestedTime: unknown;
  now: Date;
  acknowledgedSoon?: boolean;
}): NowSubmitGate {
  const choice = validateNowTimingChoice(input.timingMode, input.requestedTime);
  if (!choice.ok) return { action: "invalid", message: choice.message };
  if (choice.timingMode === NOW_TIMING_ASAP) {
    return { action: "send", timingMode: NOW_TIMING_ASAP, requestedTime: null };
  }
  const proximity = classifyNowSpecificTime(choice.requestedTime, input.now);
  if (proximity.kind === "past" || proximity.kind === "invalid") {
    return { action: "block_past", message: NOW_PAST_TIME_MESSAGE };
  }
  if (proximity.kind === "soon" && !input.acknowledgedSoon) {
    return { action: "recommend_asap", requestedTime: proximity.requestedTime };
  }
  return {
    action: "send",
    timingMode: NOW_TIMING_SPECIFIC,
    requestedTime: choice.requestedTime
  };
}

export function applyNowSoonRecommendation(
  choice: "switch_to_asap" | "keep_specific",
  requestedTime: string
): { timingMode: NowTimingMode; requestedTime: string | null } {
  if (choice === "switch_to_asap") {
    return { timingMode: NOW_TIMING_ASAP, requestedTime: null };
  }
  return {
    timingMode: NOW_TIMING_SPECIFIC,
    requestedTime: normalizeRequestedTime(requestedTime)
  };
}

/** Stored HH:MM, or null while the draft is incomplete or outside 00:00–23:59. */
export function commitNowClockInput(raw: string): string | null {
  if (/[ap]\.?m\.?/i.test(String(raw ?? ""))) return null;
  const formatted = formatNowClockInput(raw);
  const match = /^(\d{1,2}):(\d{2})$/.exec(formatted);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function readNowArrivalRange(row: {
  arrival_range?: unknown;
} | null | undefined): NowArrivalRange | null {
  return isNowArrivalRange(row?.arrival_range) ? row.arrival_range : null;
}

export function isNowArrivalRange(value: unknown): value is NowArrivalRange {
  return (
    typeof value === "string" &&
    (NOW_ARRIVAL_RANGES as readonly string[]).includes(value)
  );
}

export function nowArrivalLabel(value: NowArrivalRange): string {
  const option = NOW_ARRIVAL_OPTIONS.find((item) => item.value === value);
  return option?.label ?? "";
}

/** Short parent-card copy. Distinct from the nanny's first-person reply. */
const PARENT_ARRIVAL_ETA_LABELS: Record<NowArrivalRange, string> = {
  within_15_min: "יכולה להגיע תוך 15 דקות",
  within_30_min: "יכולה להגיע תוך 30 דקות",
  within_30_60_min: "יכולה להגיע בין 30 דקות לשעה"
};

export function parentArrivalEtaLabel(value: NowArrivalRange): string {
  return PARENT_ARRIVAL_ETA_LABELS[value];
}

/**
 * ETA line for a parent responder card.
 * Only an ASAP request with a stored arrival_range produces text.
 */
export function parentNowArrivalLine(input: {
  timingMode?: unknown;
  arrivalRange?: unknown;
}): string | null {
  if (readText(input.timingMode) !== NOW_TIMING_ASAP) return null;
  const range = readNowArrivalRange({ arrival_range: input.arrivalRange });
  if (!range) return null;
  return parentArrivalEtaLabel(range);
}

export const PARENT_BROADCAST_ALERT_SELECT =
  "id, parent_id, city, service_type, status, created_at, timing_mode";

export const PARENT_BROADCAST_ALERT_SELECT_LEGACY =
  "id, parent_id, city, service_type, status, created_at";

export const PARENT_BROADCAST_RESPONSE_SELECT = "sitter_id, arrival_range";

export const PARENT_BROADCAST_RESPONSE_SELECT_LEGACY = "sitter_id";

/**
 * Public service address for the nanny's travel decision.
 * Reads only street, house number, and city.
 */
export function publicNowServiceLocation(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const address = raw as Record<string, unknown>;
  const city = readText(address.city ?? address.cityName ?? address.city_name);
  const street = readText(address.street ?? address.streetName ?? address.street_name);
  const houseNumber = readText(
    address.houseNumber ?? address.house_number ?? address.number ?? address.house
  );

  const streetLine = [street, houseNumber].filter(Boolean).join(" ").trim();
  if (!streetLine) return null;
  return city ? `${streetLine}, ${city}` : streetLine;
}

export function parseNowRequestDetails(row: {
  location_label?: unknown;
  timing_mode?: unknown;
  requested_time?: unknown;
} | null | undefined): ParsedNowRequest {
  const locationLabel = readText(row?.location_label) || null;
  const mode = readText(row?.timing_mode);
  const requestedTimeLabel = normalizeRequestedTime(row?.requested_time);

  if (mode === NOW_TIMING_ASAP) {
    return {
      locationLabel,
      timingMode: NOW_TIMING_ASAP,
      requestedTimeLabel: null,
      timingLabel: ASAP_TIMING_LABEL,
      responseKind: "asap"
    };
  }

  if (mode === NOW_TIMING_SPECIFIC && requestedTimeLabel) {
    return {
      locationLabel,
      timingMode: NOW_TIMING_SPECIFIC,
      requestedTimeLabel,
      timingLabel: requestedTimeLabel,
      responseKind: "specific_time"
    };
  }

  return {
    locationLabel,
    timingMode: null,
    requestedTimeLabel: null,
    timingLabel: null,
    responseKind: "legacy"
  };
}

export function validateNowTimingChoice(
  mode: unknown,
  requestedTime: unknown
): NowTimingChoice {
  if (mode === NOW_TIMING_ASAP) {
    return { ok: true, timingMode: NOW_TIMING_ASAP, requestedTime: null };
  }

  if (mode === NOW_TIMING_SPECIFIC) {
    const normalized = normalizeRequestedTime(requestedTime);
    if (!normalized) {
      return { ok: false, message: "הזינו שעה תקינה עבור המועד שביקשתם." };
    }
    return {
      ok: true,
      timingMode: NOW_TIMING_SPECIFIC,
      requestedTime: normalized
    };
  }

  return {
    ok: false,
    message: "בחרו מתי אתם צריכים את הבייביסיטר — בהקדם האפשרי או שעה מסוימת."
  };
}

export function buildNowBroadcastAlertInsert(input: {
  parentId: string;
  city: string;
  address?: unknown;
  timingMode: NowTimingMode;
  requestedTime: string | null;
  serviceType?: string;
}): Record<string, unknown> {
  const locationLabel = publicNowServiceLocation(input.address);
  const row: Record<string, unknown> = {
    parent_id: input.parentId,
    city: input.city,
    status: "active",
    service_type: input.serviceType ?? "sitter",
    timing_mode: input.timingMode,
    requested_time:
      input.timingMode === NOW_TIMING_SPECIFIC ? input.requestedTime : null
  };

  if (locationLabel) {
    row.location_label = locationLabel;
  }

  return row;
}

export function legacyNowBroadcastAlertInsert(input: {
  parentId: string;
  city: string;
  serviceType?: string;
}): Record<string, unknown> {
  return {
    parent_id: input.parentId,
    city: input.city,
    status: "active",
    service_type: input.serviceType ?? "sitter"
  };
}

export function buildNowBroadcastResponseInsert(input: {
  alertId: string;
  sitterId: string;
  arrivalRange?: NowArrivalRange | null;
}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    alert_id: input.alertId,
    sitter_id: input.sitterId
  };

  if (input.arrivalRange && isNowArrivalRange(input.arrivalRange)) {
    row.arrival_range = input.arrivalRange;
  }

  return row;
}

export function legacyNowBroadcastResponseInsert(input: {
  alertId: string;
  sitterId: string;
}): Record<string, unknown> {
  return {
    alert_id: input.alertId,
    sitter_id: input.sitterId
  };
}

/** Closed accordion label after the nanny picks one arrival option. */
export function selectedArrivalControlLabel(
  value: NowArrivalRange | null
): string {
  if (!value || !isNowArrivalRange(value)) return ARRIVAL_PROMPT_LABEL;
  return nowArrivalLabel(value);
}
