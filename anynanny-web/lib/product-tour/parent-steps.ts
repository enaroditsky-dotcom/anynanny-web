import {
  PARENT_TOUR_COPY,
  PARENT_TOUR_DASHBOARD_PATH,
  PARENT_TOUR_MESSAGES_PATH,
  PARENT_TOUR_NOW_PATH,
  PARENT_TOUR_PROFILE_PATH,
  PARENT_TOUR_SEARCH_PATH,
  PARENT_TOUR_SELECTORS
} from "@/lib/product-tour/constants";
import type { ProductTourStep } from "@/lib/product-tour/types";

export const PARENT_TOUR_STEPS: readonly ProductTourStep[] = [
  {
    id: "parent-home",
    route: PARENT_TOUR_DASHBOARD_PATH,
    routeExact: true,
    targetSelector: PARENT_TOUR_SELECTORS.home,
    title: "הבית שלכם ב־AnyNanny",
    description: "מכאן אפשר לנהל את המשמרות שלכם, לבדוק את הארנק ולחפש בייביסיטר מתאימה.",
    advanceMode: "next-button",
    placement: "bottom"
  },
  {
    id: "parent-search",
    route: PARENT_TOUR_DASHBOARD_PATH,
    routeExact: true,
    targetSelector: PARENT_TOUR_SELECTORS.search,
    title: "חיפוש בייביסיטר",
    description: "מחפשים בייביסיטר לתאריך ושעה מסוימים? התחילו כאן.",
    advanceMode: "click-target",
    placement: "top"
  },
  {
    id: "parent-search-filters",
    route: PARENT_TOUR_SEARCH_PATH,
    routeExact: true,
    targetSelector: PARENT_TOUR_SELECTORS.searchFilters,
    title: "תנאי החיפוש שלכם",
    description:
      "כאן אפשר לבחור מיקום, תאריך ושעה, ניסיון, דירוג ומחיר — ולצמצם את התוצאות לפי מה שמתאים לכם.",
    advanceMode: "next-button",
    placement: "bottom"
  },
  {
    id: "verified-only",
    route: PARENT_TOUR_SEARCH_PATH,
    routeExact: true,
    targetSelector: PARENT_TOUR_SELECTORS.verifiedOnly,
    title: "זהות מאומתת בלבד",
    description:
      "רוצים שכבת ביטחון נוספת? הפעילו את האפשרות הזו כדי לראות רק בייביסיטריות שעברו אימות זהות במערכת AnyNanny.",
    advanceMode: "click-target",
    placement: "top",
    preserveTargetState: true
  },
  {
    id: "anynanny-now",
    route: "/parent",
    targetSelector: PARENT_TOUR_SELECTORS.anynannyNow,
    title: "צריכים בייביסיטר ממש עכשיו?",
    description:
      "זה AnyNanny NOW! — הדרך המהירה לשלוח בקשה מיידית לבייביסיטריות רלוונטיות באזור שלכם.",
    advanceMode: "click-target",
    placement: "top"
  },
  {
    id: "anynanny-now-explain",
    route: PARENT_TOUR_NOW_PATH,
    targetSelector: PARENT_TOUR_SELECTORS.anynannyNowExplain,
    title: "AnyNanny NOW!",
    description:
      "בחרו את האזור ולחצו על חיפוש מעכשיו לעכשיו. הבקשה תישלח מיד לבייביסיטריות הרלוונטיות באזור.",
    advanceMode: "next-button",
    placement: "bottom"
  },
  {
    id: "messages",
    route: "/parent",
    targetSelector: PARENT_TOUR_SELECTORS.messages,
    title: "הודעות",
    description: "כאן תמצאו את השיחות שקשורות למשמרות שלכם.",
    advanceMode: "click-target",
    placement: "top"
  },
  {
    id: "messages-chat",
    route: PARENT_TOUR_MESSAGES_PATH,
    routeExact: true,
    targetSelector: PARENT_TOUR_SELECTORS.messagesChat,
    title: "הצ׳אט בתוך AnyNanny",
    description: "הצ׳אט נפתח כבר מרגע שנשלחה בקשה למשמרת.",
    advanceMode: "next-button",
    placement: "bottom",
    blockTargetAction: true
  },
  {
    id: "messages-whatsapp",
    route: PARENT_TOUR_MESSAGES_PATH,
    routeExact: true,
    targetSelector: PARENT_TOUR_SELECTORS.whatsappHandoff,
    fallbackSelector: PARENT_TOUR_SELECTORS.messagesChat,
    title: "WhatsApp דרך AnyNanny",
    description:
      "אחרי שהבייביסיטרית מאשרת את המשמרת, ועד שהיא מסומנת כהסתיימה, אפשר לעבור ל־WhatsApp דרך AnyNanny.",
    advanceMode: "next-button",
    placement: "bottom",
    blockTargetAction: true
  },
  {
    id: "messages-after-shift",
    route: PARENT_TOUR_MESSAGES_PATH,
    routeExact: true,
    targetSelector: PARENT_TOUR_SELECTORS.messagesChat,
    title: "אחרי המשמרת",
    description: "אחרי סיום המשמרת, השיחה נשארת לקריאה ואפשר לכתוב בצ׳אט עוד 24 שעות.",
    advanceMode: "next-button",
    placement: "bottom",
    blockTargetAction: true
  },
  {
    id: "personal-area",
    route: "/parent",
    targetSelector: PARENT_TOUR_SELECTORS.personalArea,
    title: "האזור האישי שלכם",
    description: "כאן אפשר לעדכן את הפרטים שלכם, המשפחה, הילדים והמידע החשוב לקראת משמרת.",
    advanceMode: "click-target",
    placement: "top"
  },
  {
    id: "identity-verification",
    route: PARENT_TOUR_PROFILE_PATH,
    targetSelector: PARENT_TOUR_SELECTORS.identityVerification,
    title: "אימות זהות",
    description:
      "אימות זהות מוסיף שכבת אמון לפרופיל. משתמשים אחרים רואים רק שהזהות אומתה — לא את פרטי הזיהוי.",
    advanceMode: "next-button",
    placement: "bottom"
  },
  {
    id: "settings",
    route: "/parent",
    targetSelector: PARENT_TOUR_SELECTORS.settings,
    title: "הגדרות",
    description: "כאן אפשר לנהל התראות, עזרה, מסמכים משפטיים והגדרות החשבון.",
    advanceMode: "click-target",
    placement: "top"
  }
] as const;

export function parentTourStepCount(): number {
  return PARENT_TOUR_STEPS.length;
}

export function getParentTourStep(index: number): ProductTourStep | null {
  if (index < 0 || index >= PARENT_TOUR_STEPS.length) return null;
  return PARENT_TOUR_STEPS[index] ?? null;
}

export { PARENT_TOUR_COPY };
