import { signupPathForRole, welcomeSignupHref } from "@/lib/charter/routing";

export const STUDENT_JOBS_PATH = "/jobs/students";
export const STUDENT_JOBS_CANONICAL = "https://www.anynanny.org/jobs/students";

export const STUDENT_JOBS_TITLE = "עבודה בבייביסיטר לסטודנטיות | עבודה גמישה עם AnyNanny";

export const STUDENT_JOBS_DESCRIPTION =
  "מחפשת עבודה בבייביסיטר שמתאימה ללימודים? ב־AnyNanny את מסמנת מתי את זמינה, מגדירה את התעריף שלך ומקבלת פניות ממשפחות באזור שלך.";

export const STUDENT_JOBS_SLOGAN = "עבודת בייביסיטר בקליק — קרוב אלייך ובזמן שלך";

export const STUDENT_JOBS_H1_LINES = ["2 קליקים לבייביסיטר!"] as const;

export const STUDENT_JOBS_SUPPORT =
  "עבודה גמישה, בשעות שנוחות לך, עם משפחות אמיתיות באזור שלך.";

export const STUDENT_JOBS_PRIMARY_CTA = "הצטרפי ל־AnyNanny";
export const STUDENT_JOBS_SIGNUP_NOTE = "הרשמה פשוטה תוך 3 דקות";
export const STUDENT_JOBS_PROOF = "מאות הורים באזור שלך מחפשים בייביסיטר ממש עכשיו";
export const STUDENT_JOBS_PHONE_CTA = "לחצי כאן";

export const STUDENT_JOBS_BENEFITS = [
  {
    title: "פשוט מסמנת זמינות ביומן שלך",
    body: "את מסמנת מתי את יכולה לעבוד — ולפי זה את מופיעה בחיפושים של ההורים."
  },
  {
    title: "מגדירה כמה עולה שעת הבייביסיטר שלך",
    body: "תמיד אפשר לעדכן את התעריף באזור האישי."
  },
  {
    title: "מקבלת פניות רלוונטיות",
    body: "ממשפחות באזור שלך."
  },
  {
    title: "ההחלטה לקבל או לא לקבל את פניית ההורה היא שלך",
    body: "את בוחרת אם הפנייה מתאימה לך."
  }
] as const;

/**
 * The landing hero uses the existing library student already on this page:
 * the left half of /marketing/demo/two-worlds.png. Leave this null so the
 * later poster artwork is not substituted.
 */
export const STUDENT_CAMPAIGN_HERO_SRC: string | null = null;

export const STUDENT_CAMPAIGN_HERO_ALT =
  "סטודנטית מחפשת עבודה גמישה בבייביסיטר דרך AnyNanny";

export const STUDENT_JOBS_UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term"
] as const;

export type StudentJobsUtmKey = (typeof STUDENT_JOBS_UTM_KEYS)[number];

function toSearchParams(search: string | URLSearchParams): URLSearchParams {
  if (search instanceof URLSearchParams) return new URLSearchParams(search.toString());
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw);
}

function cleanUtmValue(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 120) return null;
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  return trimmed;
}

export function readStudentJobsUtm(search: string | URLSearchParams = ""): URLSearchParams {
  const incoming = toSearchParams(search);
  const utm = new URLSearchParams();
  for (const key of STUDENT_JOBS_UTM_KEYS) {
    const value = cleanUtmValue(incoming.get(key));
    if (value) utm.set(key, value);
  }
  return utm;
}

export function utmSearchFromRecord(
  params: Record<string, string | string[] | undefined>
): URLSearchParams {
  const query = new URLSearchParams();
  for (const key of STUDENT_JOBS_UTM_KEYS) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === "string") query.set(key, value);
  }
  return readStudentJobsUtm(query);
}

/**
 * Sitter welcome → register href. Campaign params are copied onto the welcome
 * URL and into the register `next` path so the existing signup hop keeps them.
 * Other query params are not forwarded.
 */
export function studentSitterSignupHref(search: string | URLSearchParams = ""): string {
  const utm = readStudentJobsUtm(search);
  const nextUrl = new URL(signupPathForRole("sitter"), "https://www.anynanny.org");
  utm.forEach((value, key) => {
    nextUrl.searchParams.set(key, value);
  });
  const nextPath = `${nextUrl.pathname}?${nextUrl.searchParams.toString()}`;
  const welcome = new URL(welcomeSignupHref("sitter", nextPath), "https://www.anynanny.org");
  utm.forEach((value, key) => {
    welcome.searchParams.set(key, value);
  });
  const qs = welcome.searchParams.toString();
  return qs ? `${welcome.pathname}?${qs}` : welcome.pathname;
}
