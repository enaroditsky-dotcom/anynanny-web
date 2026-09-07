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

export const SITTER_TOUR_KEY = "sitter" as const;

/**
 * Auto-offer only sitters whose onboarding completed on/after this instant.
 * Existing production sitters keep Settings-only access.
 */
export const SITTER_PRODUCT_TOUR_AUTO_OFFER_AFTER = "2026-09-07T00:00:00.000Z";

export const SITTER_TOUR_DASHBOARD_PATH = "/sitter/dashboard";
export const SITTER_TOUR_SCHEDULE_PATH = "/sitter/availability";
export const SITTER_TOUR_SHIFTS_PATH = "/sitter/shifts";
export const SITTER_TOUR_MESSAGES_PATH = "/sitter/messages";
export const SITTER_TOUR_PROFILE_PATH = "/sitter/profile";
export const SITTER_TOUR_WALLET_PATH = "/sitter/wallet";
export const SITTER_TOUR_SURPRISES_PATH = "/sitter/surprises";
export const SITTER_TOUR_SETTINGS_PATH = "/sitter/settings";
export const SITTER_TOUR_ONBOARDING_PATH = "/sitter/onboarding";

export const SITTER_TOUR_SELECTORS = {
  home: '[data-tour="sitter-home"]',
  workSchedule: '[data-tour="sitter-work-schedule"]',
  workScheduleContainer: '[data-tour="sitter-work-schedule-container"]',
  shifts: '[data-tour="sitter-shifts"]',
  shiftBoard: '[data-tour="sitter-shift-board"]',
  messages: '[data-tour="sitter-messages"]',
  messagesChat: '[data-tour="sitter-messages-chat"]',
  whatsappHandoff: '[data-tour="whatsapp-handoff"]',
  personalArea: '[data-tour="sitter-personal-area"]',
  identityVerification: '[data-tour="sitter-identity-verification"]',
  paymentMethods: '[data-tour="sitter-payment-methods"]',
  preferredPayment: '[data-tour="sitter-preferred-payment"]',
  wallet: '[data-tour="sitter-wallet"]',
  walletContainer: '[data-tour="sitter-wallet-container"]',
  surprises: '[data-tour="sitter-surprises"]',
  settings: '[data-tour="sitter-settings"]'
} as const;

export const SITTER_TOUR_COPY = {
  inviteTitle: "בואו להכיר את AnyNanny!",
  inviteBody:
    "הכנו לכן סיור קצר שיעבור איתכן על הדברים החשובים באפליקציה — סידור העבודה, משמרות, הודעות, אזור אישי, קבלת תשלום ועוד.",
  invitePrimary: "כן, תראו לי",
  inviteSecondary: "לא עכשיו",
  declinedBody: "תוכלו לראות את ההדרכה בכל רגע דרך ⚙️ הגדרות.",
  declinedConfirm: "הבנתי",
  next: "הבא",
  skip: "דלג על הסיור",
  missingTarget: "השלב הזה לא זמין כרגע. אפשר להמשיך או לדלג.",
  completionTitle: "את מוכנה להתחיל!",
  completionBody:
    "עכשיו אפשר לעדכן זמינות, להשלים את הפרופיל, להגדיר אמצעי קבלת תשלום ולהתחיל לקבל פניות למשמרות.",
  completionPrimary: "לסידור העבודה",
  completionSecondary: "לאזור האישי",
  settingsTitle: "מדריך שימוש באפליקציה",
  settingsSubtitle: "הפעילו מחדש את הסיור הקצר של AnyNanny."
} as const;

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
