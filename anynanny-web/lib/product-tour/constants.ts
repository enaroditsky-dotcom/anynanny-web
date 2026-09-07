export const PARENT_TOUR_KEY = "parent" as const;

export const USER_PRODUCT_TOURS_TABLE = "user_product_tours" as const;

/** Hero image for the parent tour invitation modal. */
export const PARENT_TOUR_INVITE_IMAGE_SRC =
  "https://www.anynanny.org/images/onboarding/welcome-anynanny-tour.png";

export const PARENT_TOUR_INVITE_IMAGE_FALLBACK = "/anynanny-clean-transparent.png.jpg";

/**
 * Auto-offer only parents whose onboarding completed on/after this instant.
 * Existing production parents keep Settings-only access.
 */
export const PARENT_PRODUCT_TOUR_AUTO_OFFER_AFTER = "2026-09-07T00:00:00.000Z";

export const PARENT_TOUR_DASHBOARD_PATH = "/parent/dashboard";
export const PARENT_TOUR_SEARCH_PATH = "/parent/search";
export const PARENT_TOUR_NOW_PATH = "/parent/broadcast";
export const PARENT_TOUR_MESSAGES_PATH = "/parent/messages";
export const PARENT_TOUR_PROFILE_PATH = "/parent/profile";
export const PARENT_TOUR_SETTINGS_PATH = "/parent/settings";
export const PARENT_TOUR_ONBOARDING_PATH = "/parent/onboarding";

export const PARENT_TOUR_SELECTORS = {
  home: '[data-tour="parent-home"]',
  search: '[data-tour="parent-search"]',
  searchFilters: '[data-tour="parent-search-filters"]',
  verifiedOnly: '[data-tour="verified-only"]',
  anynannyNow: '[data-tour="anynanny-now"]',
  anynannyNowExplain: '[data-tour="anynanny-now-explain"]',
  messages: '[data-tour="messages"]',
  messagesChat: '[data-tour="messages-chat"]',
  whatsappHandoff: '[data-tour="whatsapp-handoff"]',
  personalArea: '[data-tour="personal-area"]',
  identityVerification: '[data-tour="identity-verification"]',
  settings: '[data-tour="settings"]'
} as const;

export const PARENT_TOUR_COPY = {
  inviteTitle: "בואו להכיר את AnyNanny!",
  inviteBody:
    "הכנו לכם סיור קצר שיעבור איתכם על הדברים החשובים באפליקציה — חיפוש בייביסיטר, AnyNanny NOW!, הודעות, אזור אישי ועוד.",
  invitePrimary: "כן, תראו לי",
  inviteSecondary: "לא עכשיו",
  declinedBody: "תוכלו לראות את ההדרכה בכל רגע דרך ⚙️ הגדרות.",
  declinedConfirm: "הבנתי",
  next: "הבא",
  skip: "דלג על הסיור",
  missingTarget: "השלב הזה לא זמין כרגע. אפשר להמשיך או לדלג.",
  completionTitle: "זהו, אתם מוכנים 😊",
  completionBody:
    "אפשר להתחיל לחפש בייביסיטר — או להשתמש ב־AnyNanny NOW! כשצריכים מישהי ממש עכשיו.",
  completionPrimary: "התחילו לחפש",
  completionSecondary: "AnyNanny NOW!",
  settingsTitle: "מדריך שימוש באפליקציה",
  settingsSubtitle: "הפעילו מחדש את הסיור הקצר של AnyNanny."
} as const;
