import type { SupabaseClient } from "@supabase/supabase-js";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

/** Copy version for the optional marketing opt-in. Independent of Terms/Privacy versions. */
export const MARKETING_CONSENT_VERSION = "1.0" as const;

export const MARKETING_CONSENT_SOURCES = ["registration", "post_login_prompt", "settings"] as const;

export type MarketingConsentSource = (typeof MARKETING_CONSENT_SOURCES)[number];

export const MARKETING_CONSENT_INTRO =
  "ככל שקהילת AnyNanny גדלה, נוכל להשיג ולהציע לחברי הקהילה יותר הטבות, מבצעים והצעות רלוונטיות להורים ולבייביסיטריות.";

export const MARKETING_CONSENT_CHECKBOX_LABEL =
  "כן, אשמח לקבל מ־AnyNanny עדכונים, טיפים, הטבות והצעות מיוחדות, לרבות תוכן שיווקי ופרסומי, באמצעות SMS, דוא\"ל והתראות דיגיטליות. ניתן לבטל את ההסכמה בכל עת.";

export const MARKETING_CONSENT_PROMPT_TITLE = "נשארים מעודכנים 💚";

export const MARKETING_CONSENT_ACCEPT_LABEL = "כן, אשמח";

export const MARKETING_CONSENT_DECLINE_LABEL = "לא עכשיו";

export const MARKETING_CONSENT_SETTINGS_LABEL = "קבלת עדכונים והטבות";

export type MarketingConsentWrite = {
  marketing_consent: boolean;
  marketing_consent_at: string | null;
  marketing_consent_version: string | null;
  marketing_consent_source: MarketingConsentSource | null;
  marketing_consent_prompted_at: string;
};

export type MarketingConsentState = {
  marketing_consent: boolean;
  marketing_consent_at: string | null;
  marketing_consent_version: string | null;
  marketing_consent_source: string | null;
  marketing_consent_prompted_at: string | null;
};

const MARKETING_CONSENT_COLUMNS =
  "marketing_consent, marketing_consent_at, marketing_consent_version, marketing_consent_source, marketing_consent_prompted_at";

export function isMissingMarketingConsentColumn(message: string | null | undefined): boolean {
  return (
    isPostgrestMissingColumnError(message, "marketing_consent") ||
    isPostgrestMissingColumnError(message, "marketing_consent_at") ||
    isPostgrestMissingColumnError(message, "marketing_consent_version") ||
    isPostgrestMissingColumnError(message, "marketing_consent_source") ||
    isPostgrestMissingColumnError(message, "marketing_consent_prompted_at")
  );
}

/** Asked at registration. Checked or not, prompted_at is set so the later prompt does not repeat. */
export function createRegistrationMarketingConsent(
  optedIn: boolean,
  acceptedAt = new Date().toISOString()
): MarketingConsentWrite {
  if (!optedIn) {
    return {
      marketing_consent: false,
      marketing_consent_at: null,
      marketing_consent_version: null,
      marketing_consent_source: null,
      marketing_consent_prompted_at: acceptedAt
    };
  }

  return {
    marketing_consent: true,
    marketing_consent_at: acceptedAt,
    marketing_consent_version: MARKETING_CONSENT_VERSION,
    marketing_consent_source: "registration",
    marketing_consent_prompted_at: acceptedAt
  };
}

export function createMarketingConsentOptIn(
  source: MarketingConsentSource,
  acceptedAt = new Date().toISOString()
): MarketingConsentWrite {
  return {
    marketing_consent: true,
    marketing_consent_at: acceptedAt,
    marketing_consent_version: MARKETING_CONSENT_VERSION,
    marketing_consent_source: source,
    marketing_consent_prompted_at: acceptedAt
  };
}

/** Explicit decline. Does not grant consent. prompted_at stops the one-time prompt. */
export function createMarketingConsentDecline(
  promptedAt = new Date().toISOString()
): MarketingConsentWrite {
  return {
    marketing_consent: false,
    marketing_consent_at: null,
    marketing_consent_version: null,
    marketing_consent_source: null,
    marketing_consent_prompted_at: promptedAt
  };
}

/**
 * Settings withdrawal. Keeps the original prompted_at when the user was already asked,
 * so declining in settings does not schedule another prompt.
 */
export function createMarketingConsentOptOut(
  promptedAt: string | null | undefined,
  now = new Date().toISOString()
): MarketingConsentWrite {
  return {
    marketing_consent: false,
    marketing_consent_at: null,
    marketing_consent_version: null,
    marketing_consent_source: null,
    marketing_consent_prompted_at: promptedAt?.trim() ? promptedAt : now
  };
}

/** Never-asked users only. An existing grant, or any recorded prompt, stays quiet. */
export function shouldShowMarketingConsentPrompt(
  row: Pick<MarketingConsentState, "marketing_consent" | "marketing_consent_prompted_at"> | null | undefined
): boolean {
  if (!row) return false;
  if (row.marketing_consent === true) return false;
  return !row.marketing_consent_prompted_at?.trim();
}

function parseMarketingConsentState(data: Record<string, unknown> | null): MarketingConsentState {
  return {
    marketing_consent: data?.marketing_consent === true,
    marketing_consent_at: typeof data?.marketing_consent_at === "string" ? data.marketing_consent_at : null,
    marketing_consent_version:
      typeof data?.marketing_consent_version === "string" ? data.marketing_consent_version : null,
    marketing_consent_source:
      typeof data?.marketing_consent_source === "string" ? data.marketing_consent_source : null,
    marketing_consent_prompted_at:
      typeof data?.marketing_consent_prompted_at === "string" ? data.marketing_consent_prompted_at : null
  };
}

export async function loadMarketingConsentState(
  supabase: SupabaseClient,
  userId: string
): Promise<{ state: MarketingConsentState | null; error: string | null }> {
  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select(MARKETING_CONSENT_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingMarketingConsentColumn(error.message)) {
      return { state: null, error: null };
    }
    return { state: null, error: error.message };
  }

  return { state: parseMarketingConsentState((data ?? null) as Record<string, unknown> | null), error: null };
}

export async function persistMarketingConsent(
  supabase: SupabaseClient,
  userId: string,
  record: MarketingConsentWrite
): Promise<{ error: string | null }> {
  const { error } = await supabase.from(PROFILES_TABLE).update(record).eq("id", userId);
  if (error) {
    if (isMissingMarketingConsentColumn(error.message)) {
      return { error: null };
    }
    return { error: error.message };
  }
  return { error: null };
}
