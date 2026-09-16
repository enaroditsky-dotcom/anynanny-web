export type MarketingShot = {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  demoData: boolean;
};

function shot(
  filename: string,
  width: number,
  height: number,
  alt: string,
  demoData = false
): MarketingShot {
  return {
    src: `/marketing/${filename}`,
    width,
    height,
    alt,
    caption: demoData ? "מסכים להמחשה · נתונים לדוגמה" : "מסכים להמחשה",
    demoData
  };
}

export const MARKETING_SHOTS = {
  wallet: shot(
    "sitter-wallet-demo.png",
    1017,
    1547,
    "הכנסה לדוגמה של 900 ₪ מחמש משמרות",
    true
  ),
  history: shot(
    "sitter-history-demo.png",
    967,
    1626,
    "חמש משמרות לדוגמה באורך שעתיים עד ארבע שעות",
    true
  ),
  nowResults: shot(
    "now-parent-results-demo.png",
    865,
    1819,
    "תוצאות קריאת NOW לדוגמה עם בייביסיטריות שהביעו זמינות",
    true
  ),
  nowCall: shot(
    "now-sitter-call.png",
    470,
    877,
    "קריאת NOW לבייביסיטרית ואפשרות להביע זמינות"
  ),
  calendar: shot(
    "sitter-availability-calendar.png",
    500,
    867,
    "לוח סידור העבודה של הבייביסיטרית"
  ),
  hours: shot(
    "sitter-availability-hours.png",
    496,
    867,
    "עריכת שעות הזמינות ביום שנבחר"
  ),
  chat: shot(
    "chat-current.png",
    522,
    877,
    "צ׳אט לתיאום בין ההורה לבייביסיטרית, כולל אימוג׳י"
  ),
  payment: shot(
    "sitter-payment-confirmation.png",
    610,
    870,
    "אישור הבייביסיטרית אם קיבלה את התשלום במזומן"
  ),
  report: shot(
    "report-and-block.png",
    517,
    857,
    "אפשרויות לדיווח ולחסימת משתמש"
  ),
  familyRating: shot(
    "sitter-rates-family.png",
    547,
    862,
    "דירוג המשפחה וחוות דעת לאחר המשמרת"
  )
} as const;

export const APP_GALLERY_SHOTS: MarketingShot[] = [
  MARKETING_SHOTS.hours,
  MARKETING_SHOTS.chat,
  MARKETING_SHOTS.payment
];
