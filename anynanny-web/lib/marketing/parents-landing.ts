import { appLandingSignupHref, APP_LANDING_APP_STORE_URL, APP_LANDING_GOOGLE_PLAY_URL } from "@/lib/marketing/app-landing";
import { generalWebAppHref } from "@/lib/marketing/general-acquisition";
import { utmSearchFromRecord as readUtmSearchFromRecord } from "@/lib/marketing/student-jobs";

export const PARENTS_LANDING_PATH = "/parents";
export const PARENTS_LANDING_CANONICAL = "https://www.anynanny.org/parents";
export const PARENTS_LANDING_SITE_URL = "https://www.anynanny.org";

export const PARENTS_LANDING_TITLE = "AnyNanny | לא צריך לשלם כדי למצוא בייביסיטר";

export const PARENTS_LANDING_DESCRIPTION =
  "AnyNanny מאפשרת להורים למצוא בייביסיטר בצורה פשוטה וברורה. צפו בפרופילים, בדקו זמינות, התרשמו מדירוגים ובחרו את הבייביסיטר המתאימה למשפחה שלכם.";

export const PARENTS_LANDING_OG_TITLE = "AnyNanny — לא צריך לשלם כדי למצוא בייביסיטר";

export const PARENTS_LANDING_OG_DESCRIPTION =
  "כל אפשרויות הבייביסיטר במקום אחד — פרופילים, זמינות, דירוגים ומידע שחשוב להורים.";

export const PARENTS_LANDING_H1 = "AnyNanny — לא צריך לשלם כדי למצוא בייביסיטר!";

export const PARENTS_LANDING_REVOLUTION_HEADING = "מהפכה בעולם הבייביסיטר";

export const PARENTS_LANDING_SUPPORTING =
  "מעכשיו אתם כבר לא צריכים לחפש במקומות שונים — כל אפשרויות הבייביסיטר במקום אחד.";

export const PARENTS_LANDING_INTRO =
  "ב־AnyNanny תוכלו לצפות בפרופילים, לבדוק זמינות, להתרשם מדירוגים של משפחות אחרות ולהשוות בין אפשרויות שונות — כדי לבחור את הבייביסיטר המתאימה ביותר לצרכים של המשפחה שלכם.";

export const PARENTS_LANDING_SIMPLE_HEADING = "למצוא בייביסיטר בצורה פשוטה, ברורה ונוחה";

export const PARENTS_LANDING_SIMPLE_PARAGRAPH =
  "כשאתם צריכים בייביסיטר, לא צריך להתחיל לחפש בין קבוצות, הודעות והמלצות מפוזרות. AnyNanny מרכזת עבורכם במקום אחד בייביסיטריות, פרופילים, זמינות, דירוגים ומידע שחשוב לדעת מראש.";

export const PARENTS_LANDING_POINTS = [
  "צפייה בפרופילים של בייביסיטריות",
  "בדיקת זמינות מראש",
  "דירוגים ממשפחות אחרות",
  "השוואה בין אפשרויות שונות",
  "בחירה לפי הצרכים של המשפחה שלכם"
] as const;

export const PARENTS_LANDING_VALUE_HEADING = "כל המידע שחשוב להורים — במקום אחד";

export const PARENTS_LANDING_VALUE_PARAGRAPH =
  "במקום לעבור בין מקורות שונים, תוכלו לראות מידע מסודר וברור: מי זמינה, אילו דירוגים היא קיבלה, מה הניסיון שלה ואילו פרטים חשובים מופיעים בפרופיל. כך קל יותר להשוות ולבחור את הבייביסיטר שמתאימה למשפחה שלכם.";

export const PARENTS_LANDING_RATINGS =
  "דירוגים ממשפחות אחרות עוזרים לכם לקבל החלטה, וגם הדירוג שתתנו לאחר משמרת יוכל לסייע למשפחות אחרות בהמשך.";

export const PARENTS_LANDING_AVAILABILITY =
  "בדקו מראש אילו בייביסיטריות זמינות במועד שמתאים לכם, במקום למצוא מישהי ורק אחר כך לגלות שהיא אינה פנויה.";

export const PARENTS_LANDING_CTA = "לחיפוש בייביסיטר";

/**
 * Same Home Screen path already used when iOS cannot install from the browser
 * (`lib/push/capability.ts`). This control is the Web App, so the note does not
 * mention notifications.
 */
export const PARENTS_LANDING_IOS_INSTALL_NOTE =
  "הוסיפו את AnyNanny למסך הבית דרך שיתוף → הוספה למסך הבית.";

export const PARENTS_LANDING_ALREADY_INSTALLED_NOTE = "AnyNanny כבר מותקנת במכשיר הזה.";

/** Official App Store listing already stored for the app landing. */
export const PARENTS_LANDING_APP_STORE_URL = APP_LANDING_APP_STORE_URL;

/**
 * Official Google Play listing. Empty in the repo, so the badge stays inactive.
 */
export const PARENTS_LANDING_GOOGLE_PLAY_URL = APP_LANDING_GOOGLE_PLAY_URL;

export const PARENTS_LANDING_WORDMARK_SRC = "/brand/anynanny-official-wordmark.png";
export const PARENTS_LANDING_ANNY_SRC = "/anynanny-clean-transparent.png.jpg";
export const PARENTS_LANDING_ANNY_ALT = "Anny - הדמות של AnyNanny";

export const PARENTS_LANDING_HERO_SRC = "/SEO pages/parents rest time.png";
export const PARENTS_LANDING_HERO_ALT = "AnyNanny - הורים מוצאים בייביסיטר ומתפנים לזמן זוגי";
export const PARENTS_LANDING_HERO_WIDTH = 1087;
export const PARENTS_LANDING_HERO_HEIGHT = 732;

/** 1200×630 contain of the parent hero. The source file is not modified. */
export const PARENTS_LANDING_OG_PATH = "/SEO pages/parents-landing-og.png";
export const PARENTS_LANDING_OG_WIDTH = 1200;
export const PARENTS_LANDING_OG_HEIGHT = 630;
export const PARENTS_LANDING_OG_URL =
  "https://www.anynanny.org/SEO%20pages/parents-landing-og.png";

export function utmSearchFromRecord(
  params: Record<string, string | string[] | undefined>
): URLSearchParams {
  return readUtmSearchFromRecord(params);
}

/** Existing parent welcome → register hop. */
export function parentsLandingSignupHref(search: string | URLSearchParams = ""): string {
  return appLandingSignupHref("parent", search);
}

/** Existing Web App entry (`/` / manifest start_url) when install prompt is unavailable. */
export function parentsWebAppFallbackHref(search: string | URLSearchParams = ""): string {
  return generalWebAppHref(search);
}

export function buildParentsLandingStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${PARENTS_LANDING_SITE_URL}/#website`,
        name: "AnyNanny",
        url: PARENTS_LANDING_SITE_URL
      },
      {
        "@type": "Organization",
        "@id": `${PARENTS_LANDING_SITE_URL}/#organization`,
        name: "AnyNanny",
        url: PARENTS_LANDING_SITE_URL,
        logo: `${PARENTS_LANDING_SITE_URL}/brand/anynanny-official-wordmark.png`
      },
      {
        "@type": "WebPage",
        "@id": `${PARENTS_LANDING_CANONICAL}#webpage`,
        url: PARENTS_LANDING_CANONICAL,
        name: PARENTS_LANDING_TITLE,
        description: PARENTS_LANDING_DESCRIPTION,
        inLanguage: "he",
        isPartOf: { "@id": `${PARENTS_LANDING_SITE_URL}/#website` },
        about: { "@id": `${PARENTS_LANDING_SITE_URL}/#organization` },
        primaryImageOfPage: PARENTS_LANDING_OG_URL,
        image: PARENTS_LANDING_OG_URL
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "AnyNanny",
            item: `${PARENTS_LANDING_SITE_URL}/`
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "להורים",
            item: PARENTS_LANDING_CANONICAL
          }
        ]
      }
    ]
  };
}
