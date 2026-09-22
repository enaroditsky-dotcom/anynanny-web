import {
  SITTER_TOUR_COPY,
  SITTER_TOUR_DASHBOARD_PATH,
  SITTER_TOUR_MESSAGES_PATH,
  SITTER_TOUR_PROFILE_PATH,
  SITTER_TOUR_SCHEDULE_PATH,
  SITTER_TOUR_SELECTORS,
  SITTER_TOUR_SHIFTS_PATH,
  SITTER_TOUR_WALLET_PATH
} from "@/lib/product-tour/constants";
import type { ProductTourStep } from "@/lib/product-tour/types";

export const SITTER_TOUR_STEPS: readonly ProductTourStep[] = [
  {
    id: "sitter-home",
    route: SITTER_TOUR_DASHBOARD_PATH,
    routeExact: true,
    targetSelector: SITTER_TOUR_SELECTORS.home,
    title: "הבית שלך ב־AnyNanny",
    description: "מכאן תוכלי להגיע במהירות לסידור העבודה, לארנק ולמשמרות שלך.",
    advanceMode: "next-button",
    placement: "bottom"
  },
  {
    id: "sitter-work-schedule",
    route: SITTER_TOUR_DASHBOARD_PATH,
    routeExact: true,
    targetSelector: SITTER_TOUR_SELECTORS.workSchedule,
    title: "סידור עבודה",
    description: "לחצי כאן כדי לעדכן את הזמינות שלך.",
    advanceMode: "click-target",
    placement: "top"
  },
  {
    id: "sitter-work-schedule-explain",
    route: SITTER_TOUR_SCHEDULE_PATH,
    targetSelector: SITTER_TOUR_SELECTORS.workScheduleContainer,
    title: "הזמינות שלך",
    description: "כאן את מגדירה את הימים והשעות שבהם את פנויה לעבוד, או מסמנת לעצמך יום חופש.",
    advanceMode: "next-button",
    placement: "bottom",
    blockTargetAction: true
  },
  {
    id: "sitter-work-schedule-parents",
    route: SITTER_TOUR_SCHEDULE_PATH,
    targetSelector: SITTER_TOUR_SELECTORS.workScheduleContainer,
    title: "מה ההורים רואים?",
    description:
      "סידור העבודה שלך הוא הזמינות שהורים רואים במערכת, ולכן כדאי לשמור עליו מעודכן ככל האפשר.",
    advanceMode: "next-button",
    placement: "bottom",
    blockTargetAction: true
  },
  {
    id: "sitter-shifts",
    route: SITTER_TOUR_DASHBOARD_PATH,
    routeExact: true,
    targetSelector: SITTER_TOUR_SELECTORS.shifts,
    title: "המשמרות שלך",
    description: "כאן תראי בקשות שממתינות לאישור, יומן משמרות ומשמרות שבוצעו.",
    advanceMode: "click-target",
    placement: "top"
  },
  {
    id: "sitter-shift-board",
    route: SITTER_TOUR_SHIFTS_PATH,
    targetSelector: SITTER_TOUR_SELECTORS.shiftBoard,
    title: "בקשות למשמרת",
    description: "כשתתקבל פנייה חדשה, היא תופיע כאן ותוכלי לאשר או לדחות אותה.",
    advanceMode: "next-button",
    placement: "bottom",
    blockTargetAction: true
  },
  {
    id: "sitter-messages",
    route: "/sitter",
    targetSelector: SITTER_TOUR_SELECTORS.messages,
    title: "הודעות",
    description: "כאן תמצאי את השיחות שקשורות למשמרות שלך.",
    advanceMode: "click-target",
    placement: "top"
  },
  {
    id: "sitter-messages-chat",
    route: SITTER_TOUR_MESSAGES_PATH,
    routeExact: true,
    targetSelector: SITTER_TOUR_SELECTORS.messagesChat,
    title: "הצ׳אט בתוך AnyNanny",
    description: "הצ׳אט נפתח כבר מרגע שנשלחה בקשה למשמרת.",
    advanceMode: "next-button",
    placement: "bottom",
    blockTargetAction: true
  },
  {
    id: "sitter-whatsapp",
    route: SITTER_TOUR_MESSAGES_PATH,
    routeExact: true,
    targetSelector: SITTER_TOUR_SELECTORS.whatsappHandoff,
    fallbackSelector: SITTER_TOUR_SELECTORS.messagesChat,
    title: "WhatsApp דרך AnyNanny",
    description:
      "אחרי שאישרת את המשמרת, ועד שהיא מסומנת כהסתיימה, אפשר לעבור ל־WhatsApp דרך AnyNanny.",
    advanceMode: "next-button",
    placement: "bottom",
    blockTargetAction: true
  },
  {
    id: "sitter-after-shift",
    route: SITTER_TOUR_MESSAGES_PATH,
    routeExact: true,
    targetSelector: SITTER_TOUR_SELECTORS.messagesChat,
    title: "אחרי המשמרת",
    description: "אחרי סיום המשמרת, השיחה נשארת לקריאה ואפשר לכתוב בצ׳אט עוד 24 שעות.",
    advanceMode: "next-button",
    placement: "bottom",
    blockTargetAction: true
  },
  {
    id: "sitter-personal-area",
    route: "/sitter",
    targetSelector: SITTER_TOUR_SELECTORS.personalArea,
    title: "האזור האישי שלך",
    description:
      "כאן תוכלי לעדכן את הפרטים שלך, לשפר את הפרופיל ולהגדיל את הסיכוי שלך להתאים ליותר הורים.",
    advanceMode: "click-target",
    placement: "top"
  },
  {
    id: "sitter-identity-verification",
    route: SITTER_TOUR_PROFILE_PATH,
    targetSelector: SITTER_TOUR_SELECTORS.identityVerification,
    title: "אימות זהות",
    description: "אימות זהות עוזר להורים לבטוח בך יותר ומחזק את הפרופיל שלך בתוך המערכת.",
    advanceMode: "next-button",
    placement: "bottom",
    blockTargetAction: true
  },
  {
    id: "sitter-wallet",
    route: SITTER_TOUR_DASHBOARD_PATH,
    routeExact: true,
    targetSelector: SITTER_TOUR_SELECTORS.wallet,
    title: "הארנק שלך",
    description: "כאן תוכלי לראות את ההכנסות שלך ואת פירוט התשלומים שהתקבלו או ממתינים לאישור.",
    advanceMode: "click-target",
    placement: "top"
  },
  {
    id: "sitter-payment-methods",
    route: SITTER_TOUR_WALLET_PATH,
    targetSelector: SITTER_TOUR_SELECTORS.paymentMethods,
    title: "אמצעי קבלת תשלום",
    description: "כאן בארנק את מגדירה איך תקבלי תשלום על המשמרות שלך.",
    advanceMode: "next-button",
    placement: "bottom",
    blockTargetAction: true
  },
  {
    id: "sitter-preferred-payment",
    route: SITTER_TOUR_WALLET_PATH,
    targetSelector: SITTER_TOUR_SELECTORS.preferredPayment,
    fallbackSelector: SITTER_TOUR_SELECTORS.paymentMethods,
    title: "אמצעי תשלום מועדף",
    description: "אפשר לבחור אמצעי תשלום מועדף — וההורים יראו את ההעדפה שלך.",
    advanceMode: "next-button",
    placement: "bottom",
    blockTargetAction: true
  },
  {
    id: "sitter-surprises",
    route: "/sitter",
    targetSelector: SITTER_TOUR_SELECTORS.surprises,
    title: "הפתעות",
    description: "כאן תוכלי למצוא הפתעות, מתנות ודברים טובים שהמערכת מכינה במיוחד בשבילך.",
    advanceMode: "click-target",
    placement: "top"
  },
  {
    id: "sitter-settings",
    route: "/sitter",
    targetSelector: SITTER_TOUR_SELECTORS.settings,
    title: "הגדרות",
    description: "כאן אפשר לנהל העדפות, לצפות במסמכים חשובים ולהפעיל מחדש את מדריך השימוש.",
    advanceMode: "click-target",
    placement: "top"
  }
] as const;

export function sitterTourStepCount(): number {
  return SITTER_TOUR_STEPS.length;
}

export function getSitterTourStep(index: number): ProductTourStep | null {
  if (index < 0 || index >= SITTER_TOUR_STEPS.length) return null;
  return SITTER_TOUR_STEPS[index] ?? null;
}

export { SITTER_TOUR_COPY };
