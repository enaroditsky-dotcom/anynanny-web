import { marketingDemoHref } from "@/lib/marketing/demo-entry";
import { readStudentJobsUtm, utmSearchFromRecord as readUtmSearchFromRecord } from "@/lib/marketing/student-jobs";

export const GENERAL_ACQUISITION_PATH = "/babysitter";
export const GENERAL_ACQUISITION_CANONICAL = "https://www.anynanny.org/babysitter";

export const GENERAL_ACQUISITION_TITLE =
  "מחפשים בייביסיטר או עבודה כבייביסיטר? | AnyNanny";

export const GENERAL_ACQUISITION_DESCRIPTION =
  "מחפשים בייביסיטר באזור שלכם או עבודה כבייביסיטר? AnyNanny מחברת בין הורים לבייביסיטריות ישירות, בלי מנוי כדי לראות ובלי תשלום כדי לפנות.";

export const GENERAL_ACQUISITION_H1 =
  "מחפשים בייביסיטר? מחפשת עבודה כבייביסיטר?";

export const GENERAL_ACQUISITION_H1_FIND = "מחפשים בייביסיטר?";
export const GENERAL_ACQUISITION_H1_WORK = "מחפשת עבודה כבייביסיטר?";

export const GENERAL_ACQUISITION_DIFFERENTIATOR =
  "בלי מנוי כדי לראות. בלי תשלום כדי לפנות.";

export const GENERAL_ACQUISITION_DIRECT =
  "הורים ובייביסיטריות נפגשים כאן ישירות.";

export const GENERAL_ACQUISITION_WEB_APP_CTA = "להורדת Web App";

/**
 * Canonical Web App entry. The installable app starts at `/`
 * (`app/manifest.ts` start_url). This is not a file download or a store URL.
 */
export const GENERAL_WEB_APP_PATH = "/";

export const GENERAL_ACQUISITION_PARENT_DEMO_CTA = "אני מחפש/ת בייביסיטר — דמו";
export const GENERAL_ACQUISITION_SITTER_DEMO_CTA = "אני רוצה לעבוד כבייביסיטר — דמו";

export const GENERAL_ACQUISITION_STORE_NOTE = "האפליקציות בחנויות — בקרוב";

export const GENERAL_ACQUISITION_PARENT_HEADING = "חיפוש בייביסיטר בחינם ובקלות";
export const GENERAL_ACQUISITION_PARENT_COPY =
  "מחפשים בייביסיטר לילדים, מטפלת או עזרה אחרי הגן, בית הספר או הצהרון? ב־AnyNanny אפשר למצוא בייביסיטריות באזור שלכם, לצפות בפרופילים, בזמינות ובתעריפים ולפנות ישירות.";

export const GENERAL_ACQUISITION_SITTER_HEADING = "מחפשת עבודה כבייביסיטר?";
export const GENERAL_ACQUISITION_SITTER_COPY =
  "צרי פרופיל, סמני מתי את זמינה, הגדירי תעריף וקבלי פניות ממשפחות שמחפשות בייביסיטר או מטפלת לילדים באזור שלך.";

export const GENERAL_ACQUISITION_STUDENT_JOBS_HREF = "/jobs/students";
export const GENERAL_ACQUISITION_STUDENT_JOBS_LABEL = "עבודה בבייביסיטר לסטודנטיות";

export const GENERAL_ACQUISITION_WORDMARK_SRC = "/brand/anynanny-official-wordmark.png";
export const GENERAL_ACQUISITION_WORDMARK_ALT =
  "AnyNanny - אפליקציה למציאת בייביסיטר ועבודה בבייביסיטר";
export const GENERAL_ACQUISITION_WORDMARK_WIDTH = 1600;
export const GENERAL_ACQUISITION_WORDMARK_HEIGHT = 674;

export const GENERAL_ACQUISITION_ANNY_SRC = "/anynanny-clean-transparent.png.jpg";
export const GENERAL_ACQUISITION_ANNY_ALT = "Anny - הדמות של AnyNanny";
export const GENERAL_ACQUISITION_ANNY_SIZE = 1024;

export const GENERAL_ACQUISITION_HERO_SRC =
  "/SEO pages/anynanny-babysitter-parent-sitter-app.png";
export const GENERAL_ACQUISITION_HERO_ALT =
  "AnyNanny - חיפוש בייביסיטר ועבודה כבייביסיטר למשפחות ולמטפלות";
export const GENERAL_ACQUISITION_HERO_WIDTH = 1122;
export const GENERAL_ACQUISITION_HERO_HEIGHT = 1402;

export const GENERAL_ACQUISITION_HERO_URL =
  "https://www.anynanny.org/SEO%20pages/anynanny-babysitter-parent-sitter-app.png";

export const GENERAL_ACQUISITION_LOGO_URL =
  "https://www.anynanny.org/brand/anynanny-official-wordmark.png";

export const GENERAL_ACQUISITION_ANNY_URL =
  "https://www.anynanny.org/anynanny-clean-transparent.png.jpg";

export const SITE_URL = "https://www.anynanny.org";

export function readGeneralAcquisitionUtm(search: string | URLSearchParams = ""): URLSearchParams {
  return readStudentJobsUtm(search);
}

export function utmSearchFromRecord(
  params: Record<string, string | string[] | undefined>
): URLSearchParams {
  return readUtmSearchFromRecord(params);
}

/** Shared Web App entry. Only the five campaign params are copied. */
export function generalWebAppHref(search: string | URLSearchParams = ""): string {
  const utm = readGeneralAcquisitionUtm(search);
  const qs = utm.toString();
  return qs ? `${GENERAL_WEB_APP_PATH}?${qs}` : GENERAL_WEB_APP_PATH;
}

export function generalParentDemoHref(search: string | URLSearchParams = ""): string {
  return marketingDemoHref("parent", search);
}

export function generalSitterDemoHref(search: string | URLSearchParams = ""): string {
  return marketingDemoHref("sitter", search);
}

export function buildGeneralAcquisitionStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "AnyNanny",
        url: SITE_URL
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "AnyNanny",
        url: SITE_URL,
        logo: GENERAL_ACQUISITION_LOGO_URL,
        image: GENERAL_ACQUISITION_ANNY_URL
      },
      {
        "@type": "WebPage",
        "@id": `${GENERAL_ACQUISITION_CANONICAL}#webpage`,
        url: GENERAL_ACQUISITION_CANONICAL,
        name: GENERAL_ACQUISITION_TITLE,
        description: GENERAL_ACQUISITION_DESCRIPTION,
        inLanguage: "he",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${SITE_URL}/#organization` },
        primaryImageOfPage: GENERAL_ACQUISITION_HERO_URL,
        image: GENERAL_ACQUISITION_HERO_URL
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "AnyNanny",
            item: `${SITE_URL}/`
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "בייביסיטר",
            item: GENERAL_ACQUISITION_CANONICAL
          }
        ]
      }
    ]
  };
}
