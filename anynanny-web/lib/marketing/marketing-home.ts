import { SITE_URL } from "@/lib/marketing/general-acquisition";
import { MARKETING_STORY_PATH } from "@/lib/marketing/chapters";

export const MARKETING_HOME_CANONICAL = `${SITE_URL}/`;

export const MARKETING_HOME_TITLE = "צריכים בייביסיטר? מחפשים עבודה? | AnyNanny";

export const MARKETING_HOME_DESCRIPTION =
  "הורים ובייביסיטריות נפגשים במקום אחד. חיפוש לפי עיר, זמינות, ניסיון ומחיר שעתי — ללא דמי מנוי וללא עמלת הזמנה.";

export const MARKETING_HOME_OG_TITLE = "צריכים בייביסיטר? מחפשים עבודה? נפגשים ב־AnyNanny";

export const MARKETING_HOME_OG_IMAGE_PATH = "/SEO pages/anynanny-app-landing-og.png";
export const MARKETING_HOME_OG_WIDTH = 1200;
export const MARKETING_HOME_OG_HEIGHT = 630;
export const MARKETING_HOME_OG_ALT = "AnyNanny — הורים ובייביסיטריות נפגשים במקום אחד";
export const MARKETING_HOME_OG_URL = `${SITE_URL}/SEO%20pages/anynanny-app-landing-og.png`;

export const MARKETING_STORY_CANONICAL = `${SITE_URL}${MARKETING_STORY_PATH}`;

export const MARKETING_STORY_TITLE = "הסיפור של AnyNanny";

/** Previous homepage description, kept with the storytelling page. */
export const MARKETING_STORY_DESCRIPTION =
  "ברוכים הבאים ל־AnyNanny. מקום שבו משפחות ובייביסיטריות נפגשות, מכירות ובוחרות זו בזו.";

export const CONVERSION_VIDEO_SRC = "/marketing/video/anynanny-horizontal-1080p-caption.mp4";
export const CONVERSION_VIDEO_POSTER = "/SEO pages/anynanny banner p and b.png";
export const CONVERSION_VIDEO_BYTES = 28731014;

export function buildMarketingHomeStructuredData() {
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
        logo: `${SITE_URL}/brand/anynanny-official-wordmark.png`
      },
      {
        "@type": "WebPage",
        "@id": `${MARKETING_HOME_CANONICAL}#webpage`,
        url: MARKETING_HOME_CANONICAL,
        name: MARKETING_HOME_TITLE,
        description: MARKETING_HOME_DESCRIPTION,
        inLanguage: "he",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${SITE_URL}/#organization` },
        primaryImageOfPage: MARKETING_HOME_OG_URL
      }
    ]
  };
}

export function buildMarketingStoryStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${MARKETING_STORY_CANONICAL}#webpage`,
        url: MARKETING_STORY_CANONICAL,
        name: MARKETING_STORY_TITLE,
        description: MARKETING_STORY_DESCRIPTION,
        inLanguage: "he",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: { "@id": `${SITE_URL}/#organization` }
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "AnyNanny",
            item: MARKETING_HOME_CANONICAL
          },
          {
            "@type": "ListItem",
            position: 2,
            name: MARKETING_STORY_TITLE,
            item: MARKETING_STORY_CANONICAL
          }
        ]
      }
    ]
  };
}
