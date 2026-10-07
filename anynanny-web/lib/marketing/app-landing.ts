import { signupPathForRole, welcomeSignupHref } from "@/lib/charter/routing";
import { readStudentJobsUtm, utmSearchFromRecord as readUtmSearchFromRecord } from "@/lib/marketing/student-jobs";

export const APP_LANDING_PATH = "/app";
export const APP_LANDING_CANONICAL = "https://www.anynanny.org/app";
export const APP_LANDING_SITE_URL = "https://www.anynanny.org";
export const APP_LANDING_SITE_LABEL = "ANYNANNY.ORG";

export const APP_LANDING_TITLE = "AnyNanny | בייביסיטר למשפחות ועבודה לבייביסיטריות";

export const APP_LANDING_DESCRIPTION =
  "AnyNanny מחברת בין משפחות לבייביסיטריות לפי אזור, זמינות, מחיר, ניסיון ודירוגים. מחפשים בייביסיטר או עבודה כבייביסיטרית? הצטרפו ל־AnyNanny.";

export const APP_LANDING_OG_TITLE = "AnyNanny — בייביסיטר למשפחות ועבודה לבייביסיטריות";

export const APP_LANDING_OG_DESCRIPTION =
  "מחפשים בייביסיטר או עבודה כבייביסיטרית? פרופילים, זמינות, מחיר לשעה, דירוגים ואימות זהות במקום אחד.";

export const APP_LANDING_H1 = "AnyNanny — בייביסיטר למשפחות ועבודה לבייביסיטריות";

export const APP_LANDING_INTRO =
  "AnyNanny מחברת בין משפחות שמחפשות בייביסיטר לבין בייביסיטריות שמחפשות עבודה. במקום לחפש שוב ושוב בקבוצות פייסבוק, פורומים וצ'אטים, אפשר לרכז במקום אחד פרופיל, אזור, זמינות, מחיר לשעה, ניסיון, דירוגים ואימות זהות.";

export const APP_LANDING_SITTER_HEADING = "מחפשת עבודה כבייביסיטרית?";

export const APP_LANDING_SITTER_PARAGRAPHS = [
  "את לא צריכה להקפיץ שוב ושוב פוסטים בפייסבוק, לפרסם את עצמך מחדש בכל קבוצה או לשלם רק כדי להופיע בחיפושים.",
  "ב־AnyNanny את יוצרת פרופיל אישי ומגדירה בעצמך את האזור שבו את עובדת, התעריף שלך לשעה והשעות שבהן את זמינה.",
  "הורים יכולים לראות מראש את הפרטים החשובים ולפנות אלייך כאשר הפרופיל שלך מתאים למה שהם מחפשים."
] as const;

export const APP_LANDING_SITTER_POINTS = [
  "את קובעת את התעריף שלך לשעה",
  "את מגדירה את שעות הזמינות שלך",
  "הורים רואים את התעריף והזמינות מראש",
  "את בונה דירוג שממשיך איתך ממשפחה למשפחה",
  "אפשר להשלים אימות זהות",
  "אפשר להוסיף תמונת פרופיל ופרטים אישיים",
  "ככל שהפרופיל מלא יותר, קל יותר להורים לבחור בך"
] as const;

export const APP_LANDING_SITTER_EMPHASIS =
  "כל משמרת טובה יכולה לעזור לך לבנות מוניטין אישי בתוך AnyNanny.";

export const APP_LANDING_SITTER_CTA = "להרשמה כבייביסיטרית";

export const APP_LANDING_PARENT_HEADING = "מחפשים בייביסיטר?";

export const APP_LANDING_PARENT_PARAGRAPHS = [
  "אין צורך לעבור בין קבוצות פייסבוק, פורומים, צ'אטים ומודעות ישנות — ואז לגלות שהבייביסיטר שמצאתם בכלל לא זמינה בזמן שאתם צריכים אותה.",
  "ב־AnyNanny אתם מגדירים את תנאי החיפוש ומקבלים תוצאות רלוונטיות לפי הצרכים של המשפחה שלכם."
] as const;

export const APP_LANDING_PARENT_POINTS = [
  "חיפוש לפי אזור",
  "חיפוש לפי זמן וזמינות",
  "מחיר לשעה מוצג מראש",
  "ניסיון ופרטי פרופיל",
  "דירוגים",
  "סטטוס אימות זהות",
  "אפשרות לבחור מתוך תוצאות שמתאימות לתנאי החיפוש"
] as const;

export const APP_LANDING_PARENT_NOTE =
  "גם הפרופיל של ההורים חשוב. ככל שתמלאו יותר פרטים, תוסיפו תמונת פרופיל ותשלימו אימות זהות, כך יהיה לבייביסיטריות קל יותר להכיר את המשפחה ולהרגיש בטוחות לקבל פנייה.";

export const APP_LANDING_PARENT_CTA = "לחיפוש בייביסיטר";

export const APP_LANDING_PROFILE_HEADING = "פרופיל מלא עוזר לשני הצדדים";

export const APP_LANDING_PROFILE_PARAGRAPHS = [
  "ב־AnyNanny לשני הצדדים יש פרופיל אישי.",
  "לבייביסיטריות מומלץ להוסיף תמונה, ניסיון, אזור עבודה, תעריף, זמינות ואימות זהות.",
  "להורים מומלץ להוסיף תמונת פרופיל, פרטים על המשפחה ולהשלים אימות זהות.",
  "ככל שהמידע ברור ומלא יותר, כך קל יותר לקבל החלטה לפני שיוצרים קשר."
] as const;

export const APP_LANDING_DOWNLOAD_HEADING = "להורדת AnyNanny";

export const APP_LANDING_APP_STORE_LABEL = "להורדה ב־App Store";

/**
 * Real AnyNanny App Store listing.
 * `public/marketing/demo/store-links.js` also keeps APP_STORE_URL empty.
 * Leave this empty until that listing URL is stored in the repo.
 */
export const APP_LANDING_APP_STORE_URL = "https://apps.apple.com/il/app/anynanny/id6813214477";

/**
 * Real AnyNanny Google Play listing.
 * The demo store helper keeps GOOGLE_PLAY_URL empty, so Play is not shown as live.
 */
export const APP_LANDING_GOOGLE_PLAY_URL = "";

export const APP_LANDING_CLOSING = "AnyNanny — פשוט למצוא זמן לחיים.";

export const APP_LANDING_PARENT_ENTRY_CTA = "אני מחפש/ת בייביסיטר";
export const APP_LANDING_SITTER_ENTRY_CTA = "אני רוצה לעבוד כבייביסיטרית";

export const APP_LANDING_HERO_SRC = "/SEO pages/anynanny banner p and b.png";
export const APP_LANDING_HERO_ALT = "AnyNanny - אפליקציה להורים ולבייביסיטריות בישראל";
export const APP_LANDING_HERO_WIDTH = 1672;
export const APP_LANDING_HERO_HEIGHT = 941;

/** 1.91:1 derivative for Facebook. The source banner is not modified. */
export const APP_LANDING_OG_PATH = "/SEO pages/anynanny-app-landing-og.png";
export const APP_LANDING_OG_WIDTH = 1200;
export const APP_LANDING_OG_HEIGHT = 630;
export const APP_LANDING_OG_URL =
  "https://www.anynanny.org/SEO%20pages/anynanny-app-landing-og.png";

export function utmSearchFromRecord(
  params: Record<string, string | string[] | undefined>
): URLSearchParams {
  return readUtmSearchFromRecord(params);
}

/**
 * Existing welcome → register hop.
 * Sitter keeps `track=babysitter` from `signupPathForRole`.
 * Only the five campaign params are copied.
 */
export function appLandingSignupHref(
  role: "parent" | "sitter",
  search: string | URLSearchParams = ""
): string {
  const utm = readStudentJobsUtm(search);
  const nextUrl = new URL(signupPathForRole(role), APP_LANDING_SITE_URL);
  utm.forEach((value, key) => {
    nextUrl.searchParams.set(key, value);
  });
  const nextPath = `${nextUrl.pathname}?${nextUrl.searchParams.toString()}`;
  const welcome = new URL(welcomeSignupHref(role, nextPath), APP_LANDING_SITE_URL);
  utm.forEach((value, key) => {
    welcome.searchParams.set(key, value);
  });
  const qs = welcome.searchParams.toString();
  return qs ? `${welcome.pathname}?${qs}` : welcome.pathname;
}

export function buildAppLandingStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${APP_LANDING_SITE_URL}/#website`,
        name: "AnyNanny",
        url: APP_LANDING_SITE_URL
      },
      {
        "@type": "Organization",
        "@id": `${APP_LANDING_SITE_URL}/#organization`,
        name: "AnyNanny",
        url: APP_LANDING_SITE_URL,
        logo: `${APP_LANDING_SITE_URL}/brand/anynanny-official-wordmark.png`
      },
      {
        "@type": "WebPage",
        "@id": `${APP_LANDING_CANONICAL}#webpage`,
        url: APP_LANDING_CANONICAL,
        name: APP_LANDING_TITLE,
        description: APP_LANDING_DESCRIPTION,
        inLanguage: "he",
        isPartOf: { "@id": `${APP_LANDING_SITE_URL}/#website` },
        about: { "@id": `${APP_LANDING_SITE_URL}/#organization` },
        primaryImageOfPage: APP_LANDING_OG_URL,
        image: APP_LANDING_OG_URL
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "AnyNanny",
            item: `${APP_LANDING_SITE_URL}/`
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "AnyNanny",
            item: APP_LANDING_CANONICAL
          }
        ]
      }
    ]
  };
}
