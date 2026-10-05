import type { Metadata } from "next";
import {
  GENERAL_ACQUISITION_ANNY_URL,
  GENERAL_ACQUISITION_CANONICAL,
  GENERAL_ACQUISITION_HERO_HEIGHT,
  GENERAL_ACQUISITION_HERO_URL,
  GENERAL_ACQUISITION_HERO_WIDTH,
  GENERAL_ACQUISITION_LOGO_URL,
  SITE_URL
} from "@/lib/marketing/general-acquisition";

export const BABYSITTER_CITY_SLUGS = [
  "haifa",
  "tel-aviv",
  "jerusalem",
  "rishon-lezion",
  "petah-tikva",
  "ramat-gan",
  "givatayim",
  "holon",
  "bat-yam",
  "netanya",
  "rehovot",
  "ness-ziona",
  "givat-shmuel",
  "beer-sheva",
  "herzliya"
] as const;

export type BabysitterCitySlug = (typeof BABYSITTER_CITY_SLUGS)[number];

export type BabysitterCity = {
  slug: BabysitterCitySlug;
  nameHe: string;
  inCityHe: string;
  h1: string;
  h1Find: string;
  h1Work: string;
  title: string;
  description: string;
  parentHeading: string;
  parentCopy: string;
  sitterHeading: string;
  sitterCopy: string;
  nearbyCitySlugs: readonly BabysitterCitySlug[];
  heroAlt: string;
  /** One local sentence. Real geography only — no counts, rates, or reviews. */
  localNote: string;
};

type BabysitterCityInput = {
  slug: BabysitterCitySlug;
  nameHe: string;
  inCityHe: string;
  description: string;
  parentCopy: string;
  sitterCopy: string;
  nearbyCitySlugs: readonly BabysitterCitySlug[];
  localNote: string;
};

function nearby(...slugs: BabysitterCitySlug[]): readonly BabysitterCitySlug[] {
  return slugs;
}

function defineCity(input: BabysitterCityInput): BabysitterCity {
  const { inCityHe } = input;
  const h1Find = `מחפשים בייביסיטר ${inCityHe}?`;
  const h1Work = `מחפשת עבודה כבייביסיטר ${inCityHe}?`;
  return {
    ...input,
    h1Find,
    h1Work,
    h1: `${h1Find} ${h1Work}`,
    title: `בייביסיטר ${inCityHe} | חיפוש בייביסיטר ועבודה בבייביסיטר | AnyNanny`,
    parentHeading: `חיפוש בייביסיטר ${inCityHe}`,
    sitterHeading: `מחפשת עבודה כבייביסיטר ${inCityHe}?`,
    heroAlt: `AnyNanny - חיפוש בייביסיטר ועבודה בבייביסיטר ${inCityHe}`
  };
}

export const BABYSITTER_CITIES: readonly BabysitterCity[] = [
  defineCity({
    slug: "haifa",
    nameHe: "חיפה",
    inCityHe: "בחיפה",
    description:
      "מחפשים בייביסיטר בחיפה? ב־AnyNanny אפשר למצוא בייביסיטריות באזור, לבדוק זמינות ותעריפים ולפנות ישירות. מחפשת עבודה כבייביסיטר בחיפה? הצטרפי וקבלי פניות ממשפחות באזור.",
    parentCopy:
      "מחפשים בייביסיטר לילדים בחיפה? ב־AnyNanny אפשר למצוא בייביסיטריות באזור, לבדוק פרופילים, זמינות ותעריפים ולפנות ישירות.",
    sitterCopy:
      "צרי פרופיל, סמני מתי את זמינה, הגדירי תעריף וקבלי פניות ממשפחות שמחפשות בייביסיטר באזור חיפה. זו עבודה עם ילדים לפי השעות שנוחות לך.",
    nearbyCitySlugs: nearby(),
    localNote:
      "בחיפה כדאי לבדוק מראש אם הבייביסיטרית זמינה בכרמל, בהדר, בעיר התחתית או בשכונה אחרת — המרחקים בעיר לא תמיד קצרים."
  }),
  defineCity({
    slug: "tel-aviv",
    nameHe: "תל אביב",
    inCityHe: "בתל אביב",
    description:
      "מחפשים בייביסיטר בתל אביב? אפשר לעיין בבייביסיטריות בעיר ובערים הצמודות, לראות זמינות ותעריף ולפנות בלי מנוי. מחפשת עבודה כבייביסיטר בתל אביב? סמני מתי את פנויה וקבלי פניות ממשפחות בעיר.",
    parentCopy:
      "מחפשים בייביסיטר לילדים בתל אביב? אפשר למצוא בייביסיטרית בצפון העיר, במרכז או ביפו, לראות מתי היא פנויה ולפנות ישירות.",
    sitterCopy:
      "צרי פרופיל, סמני זמינות והגדירי תעריף. משפחות בתל אביב שמחפשות עבודה עם ילדים יוכלו לפנות אלייך כשהשעות מתאימות.",
    nearbyCitySlugs: nearby("ramat-gan", "givatayim", "holon", "bat-yam", "petah-tikva", "herzliya"),
    localNote:
      "בתל אביב אפשר להתחיל קרוב לבית — בצפון, במרכז או ביפו — ואם המרחק מתאים, גם ברמת גן, בגבעתיים, בחולון, בבת ים, בפתח תקווה או בהרצליה."
  }),
  defineCity({
    slug: "jerusalem",
    nameHe: "ירושלים",
    inCityHe: "בירושלים",
    description:
      "מחפשים בייביסיטר בירושלים? ב־AnyNanny בודקים פרופיל, זמינות ותעריף ופונים ישירות למי שמתאימה לשכונה שלכם. מחפשת עבודה עם ילדים בירושלים? הצטרפי וקבלי פניות ממשפחות בעיר.",
    parentCopy:
      "מחפשים בייביסיטר לילדים בירושלים? ב־AnyNanny אפשר למצוא בייביסיטריות בעיר, לבדוק אם הזמינות מתאימה לשכונה שלכם ולפנות בלי מנוי.",
    sitterCopy:
      "צרי פרופיל, סמני את השעות שנוחות לך והגדירי תעריף. כך משפחות שמחפשות עבודה עם ילדים בירושלים יוכלו לפנות כשזה מתאים לך.",
    nearbyCitySlugs: nearby(),
    localNote: "בירושלים המעבר בין שכונות לוקח זמן, ולכן שווה לראות איפה הבייביסיטרית זמינה לפני שפונים."
  }),
  defineCity({
    slug: "rishon-lezion",
    nameHe: "ראשון לציון",
    inCityHe: "בראשון לציון",
    description:
      "מחפשים בייביסיטר בראשון לציון? אפשר לבדוק בייביסיטריות בעיר ולפנות ישירות, ואם צריך גם להציץ לערים שכנות כמו חולון ונס ציונה. מחפשת עבודה כבייביסיטר בראשון לציון? קבלי פניות ממשפחות קרובות.",
    parentCopy:
      "מחפשים בייביסיטר לילדים בראשון לציון? רואים פרופילים ותעריפים, מוצאים בייביסיטרית בעיר או קרוב אליה, ופונים ישירות.",
    sitterCopy:
      "סמני זמינות, הגדירי תעריף וקבלי פניות ממשפחות בראשון לציון ובערים הסמוכות שמחפשות עבודה עם ילדים.",
    nearbyCitySlugs: nearby("holon", "bat-yam", "rehovot", "ness-ziona"),
    localNote:
      "ראשון לציון יושבת בין חולון ובת ים לבין רחובות ונס ציונה, ולכן חיפוש באזור לפעמים כולל גם עיר שכנה."
  }),
  defineCity({
    slug: "petah-tikva",
    nameHe: "פתח תקווה",
    inCityHe: "בפתח תקווה",
    description:
      "מחפשים בייביסיטר בפתח תקווה? ב־AnyNanny רואים מי זמינה, מה התעריף, ופונים בלי תשלום על עצם הפנייה. מחפשת עבודה כבייביסיטר בפתח תקווה? הצטרפי וקבלי פניות ממשפחות בעיר ובגבעת שמואל.",
    parentCopy:
      "מחפשים בייביסיטר לילדים בפתח תקווה? אפשר למצוא בייביסיטריות בעיר, לבדוק זמינות אחרי הצהריים או בערב, ולפנות ישירות.",
    sitterCopy:
      "צרי פרופיל וסמני מתי את זמינה. משפחות בפתח תקווה ובגבעת שמואל שמחפשות עבודה עם ילדים יוכלו לפנות לפי התעריף שהגדרת.",
    nearbyCitySlugs: nearby("givat-shmuel", "ramat-gan", "tel-aviv"),
    localNote: "פתח תקווה קרובה לגבעת שמואל ולרמת גן, והחיפוש כאן לרוב נשאר במזרח גוש דן."
  }),
  defineCity({
    slug: "ramat-gan",
    nameHe: "רמת גן",
    inCityHe: "ברמת גן",
    description:
      "מחפשים בייביסיטר ברמת גן? העיר צמודה לגבעתיים ולתל אביב, וב־AnyNanny אפשר לבדוק זמינות ותעריף לפני שפונים. מחפשת עבודה כבייביסיטר ברמת גן? סמני שעות וקבלי פניות מהאזור.",
    parentCopy:
      "מחפשים בייביסיטר לילדים ברמת גן? ב־AnyNanny אפשר למצוא בייביסיטרית קרובה, לעיין בפרופיל ובתעריף ולפנות ישירות.",
    sitterCopy:
      "הגדירי תעריף וזמינות וקבלי פניות ממשפחות ברמת גן שמחפשות עבודה עם ילדים בשעות שמתאימות לך.",
    nearbyCitySlugs: nearby("givatayim", "tel-aviv", "givat-shmuel", "petah-tikva"),
    localNote:
      "מרמת גן קל להגיע לגבעתיים ולתל אביב, ומשפחות לפעמים מרחיבות את החיפוש גם לגבעת שמואל או לפתח תקווה."
  }),
  defineCity({
    slug: "givatayim",
    nameHe: "גבעתיים",
    inCityHe: "בגבעתיים",
    description:
      "מחפשים בייביסיטר בגבעתיים? בעיר קומפקטית החיפוש נשאר קרוב לבית — פרופיל, זמינות ותעריף, ואז פנייה ישירה. מחפשת עבודה כבייביסיטר בגבעתיים? קבלי פניות ממשפחות בעיר וברמת גן.",
    parentCopy:
      "מחפשים בייביסיטר לילדים בגבעתיים? העיר קטנה, אז קל למצוא בייביסיטרית במרחק קצר, לבדוק זמינות ולפנות.",
    sitterCopy:
      "גבעתיים צמודה לרמת גן, אז אפשר לקבל פניות משתיהן. סמני זמינות, הגדירי תעריף, וקבלי עבודה עם ילדים כשזה מתאים לך.",
    nearbyCitySlugs: nearby("ramat-gan", "tel-aviv"),
    localNote: "גבעתיים צמודה לרמת גן מצד אחד ולתל אביב מצד שני, והחיפוש לרוב נשאר במשולש הזה."
  }),
  defineCity({
    slug: "holon",
    nameHe: "חולון",
    inCityHe: "בחולון",
    description:
      "מחפשים בייביסיטר בחולון? העיר יושבת בין תל אביב, בת ים וראשון לציון, וב־AnyNanny רואים מי פנויה ופונים ישירות. מחפשת עבודה כבייביסיטר בחולון? הצטרפי וקבלי פניות גם אחרי הגן ובשעות הערב.",
    parentCopy:
      "מחפשים בייביסיטר לילדים בחולון? אפשר למצוא בייביסיטריות בעיר, לראות מי פנויה אחרי הגן או בית הספר, ולפנות ישירות.",
    sitterCopy:
      "סמני מתי את יכולה, הגדירי תעריף וקבלי פניות ממשפחות בחולון שמחפשות עבודה עם ילדים אחרי הצהריים או בערב.",
    nearbyCitySlugs: nearby("bat-yam", "tel-aviv", "rishon-lezion"),
    localNote: "חולון נוגעת בתל אביב מצפון, בבת ים ממערב ובראשון לציון מדרום."
  }),
  defineCity({
    slug: "bat-yam",
    nameHe: "בת ים",
    inCityHe: "בבת ים",
    description:
      "מחפשים בייביסיטר בבת ים? אפשר לבדוק בייביסיטריות לאורך העיר ובחולון הסמוכה, ולפנות רק אחרי שרואים זמינות ותעריף. מחפשת עבודה כבייביסיטר בבת ים? קבלי פניות ממשפחות קרובות.",
    parentCopy:
      "מחפשים בייביסיטר לילדים בבת ים? ב־AnyNanny אפשר למצוא בייביסיטריות בעיר, לבדוק תעריף וזמינות ולפנות בלי מנוי כדי לראות.",
    sitterCopy:
      "לאורך בת ים, מחולון ועד הים, סמני איפה נוח לך וקבלי פניות ממשפחות שמחפשות עבודה עם ילדים.",
    nearbyCitySlugs: nearby("holon", "tel-aviv", "rishon-lezion"),
    localNote: "בת ים נמשכת לאורך הים וצמודה לחולון, והחיפוש כאן לרוב נשאר בדרום גוש דן."
  }),
  defineCity({
    slug: "netanya",
    nameHe: "נתניה",
    inCityHe: "בנתניה",
    description:
      "מחפשים בייביסיטר בנתניה? ב־AnyNanny החיפוש נשאר בעיר — מעיר ימים ועד דרום נתניה — עם פרופיל, זמינות ותעריף לפני הפנייה. מחפשת עבודה כבייביסיטר בנתניה? הצטרפי וקבלי פניות ממשפחות באזור שלך.",
    parentCopy:
      "מחפשים בייביסיטר לילדים בנתניה? אפשר למצוא בייביסיטרית בעיר ימים, בקריית השרון או בדרום העיר, ולוודא שהמרחק מתאים לפני שפונים.",
    sitterCopy:
      "צרי פרופיל, סמני מתי את זמינה והגדירי תעריף. משפחות בנתניה שמחפשות עבודה עם ילדים יוכלו לפנות אלייך ישירות.",
    nearbyCitySlugs: nearby(),
    localNote:
      "בנתניה יש מרחק אמיתי בין עיר ימים, קריית השרון, מרכז העיר והשכונות הדרומיות, ולכן הזמינות חשובה לא פחות מהעיר עצמה."
  }),
  defineCity({
    slug: "rehovot",
    nameHe: "רחובות",
    inCityHe: "ברחובות",
    description:
      "מחפשים בייביסיטר ברחובות? אפשר למצוא בייביסיטריות בעיר ובנס ציונה, לראות זמינות ולפנות ישירות. מחפשת עבודה כבייביסיטר ברחובות? סמני מתי את פנויה וקבלי פניות ממשפחות באזור.",
    parentCopy:
      "מחפשים בייביסיטר לילדים ברחובות? אפשר לבדוק מי פנויה בעיר או בנס ציונה הצמודה, לראות תעריף ולפנות ישירות.",
    sitterCopy:
      "צרי פרופיל, הגדירי תעריף וסמני זמינות. משפחות ברחובות ובנס ציונה שמחפשות עבודה עם ילדים יוכלו לפנות אלייך.",
    nearbyCitySlugs: nearby("ness-ziona", "rishon-lezion"),
    localNote: "רחובות ונס ציונה יושבות צמוד, וחיפוש רחב יותר באזור מגיע גם לראשון לציון."
  }),
  defineCity({
    slug: "ness-ziona",
    nameHe: "נס ציונה",
    inCityHe: "בנס ציונה",
    description:
      "מחפשים בייביסיטר בנס ציונה? ב־AnyNanny בודקים בייביסיטריות בעיר הקטנה וברחובות השכנה, בלי מנוי כדי לראות פרטים. מחפשת עבודה כבייביסיטר בנס ציונה? קבלי פניות ממשפחות קרובות.",
    parentCopy:
      "מחפשים בייביסיטר לילדים בנס ציונה? אפשר למצוא בייביסיטרית בעיר או ברחובות הצמודה, לראות תעריף ולפנות בלי מנוי.",
    sitterCopy:
      "סמני את השעות שלך והגדירי תעריף. כך משפחות בנס ציונה וברחובות שמחפשות עבודה עם ילדים יוכלו למצוא אותך.",
    nearbyCitySlugs: nearby("rehovot", "rishon-lezion"),
    localNote: "נס ציונה קטנה במרכז וצמודה לרחובות, והכביש ביניהן קצר."
  }),
  defineCity({
    slug: "givat-shmuel",
    nameHe: "גבעת שמואל",
    inCityHe: "בגבעת שמואל",
    description:
      "מחפשים בייביסיטר בגבעת שמואל? עיר קטנה בין פתח תקווה לרמת גן, וב־AnyNanny פונים ישירות אחרי בדיקת זמינות ותעריף. מחפשת עבודה כבייביסיטר בגבעת שמואל? הצטרפי וקבלי פניות מהאזור.",
    parentCopy:
      "מחפשים בייביסיטר לילדים בגבעת שמואל? ב־AnyNanny אפשר למצוא בייביסיטריות בעיר הקטנה ובפתח תקווה, ולבדוק זמינות לפני הפנייה.",
    sitterCopy:
      "סמני שעות בגבעת שמואל או בפתח תקווה הצמודה, הגדירי תעריף, וקבלי פניות ממשפחות שמחפשות עבודה עם ילדים ממש ליד הבית.",
    nearbyCitySlugs: nearby("petah-tikva", "ramat-gan", "tel-aviv"),
    localNote: "גבעת שמואל יושבת בין פתח תקווה לרמת גן, ומשם גם תל אביב קרובה כשהשעה מתאימה."
  }),
  defineCity({
    slug: "beer-sheva",
    nameHe: "באר שבע",
    inCityHe: "בבאר שבע",
    description:
      "מחפשים בייביסיטר בבאר שבע? לפני שפונים, כדאי לראות שהזמינות מתאימה לשכונה — המרחקים בעיר גדולים. מחפשת עבודה כבייביסיטר בבאר שבע? סמני באיזה אזור נוח לך וקבלי פניות ממשפחות שם.",
    parentCopy:
      "מחפשים בייביסיטר לילדים בבאר שבע? אפשר למצוא בייביסיטרית לפי שכונה, לבדוק מתי היא פנויה ולפנות ישירות.",
    sitterCopy:
      "אם נוח לך בשכונות הוותיקות, בנווה זאב או ברמות, סמני את זה בזמינות. משפחות בבאר שבע יוכלו לפנות לעבודה עם ילדים לפי האזור שהגדרת.",
    nearbyCitySlugs: nearby(),
    localNote:
      "בבאר שבע המרחק בין השכונות הוותיקות, נווה זאב ורמות יכול להיות גדול, ולכן כדאי לבדוק שהאזור מתאים."
  }),
  defineCity({
    slug: "herzliya",
    nameHe: "הרצליה",
    inCityHe: "בהרצליה",
    description:
      "מחפשים בייביסיטר בהרצליה? אפשר לבדוק בייביסיטריות בהרצליה פיתוח, במרכז העיר וגם בתל אביב הסמוכה, ולפנות בלי תשלום על הפנייה. מחפשת עבודה כבייביסיטר בהרצליה? סמני זמינות וקבלי פניות.",
    parentCopy:
      "מחפשים בייביסיטר לילדים בהרצליה? ב־AnyNanny אפשר למצוא בייביסיטריות בפיתוח ובמרכז העיר, לראות תעריף ולפנות ישירות.",
    sitterCopy:
      "הגדירי תעריף וסמני שעות. משפחות בהרצליה שמחפשות עבודה עם ילדים — מהפיתוח ועד מרכז העיר — יוכלו לפנות אלייך ישירות.",
    nearbyCitySlugs: nearby("tel-aviv"),
    localNote: "הרצליה נמתחת מהפיתוח ומערב העיר עד האזור הקרוב לתל אביב, והמרחק בתוך העיר שווה בדיקה."
  })
];

const CITY_BY_SLUG = new Map<BabysitterCitySlug, BabysitterCity>(
  BABYSITTER_CITIES.map((city) => [city.slug, city])
);

function assertCityConfig(cities: readonly BabysitterCity[]) {
  const seen = new Set<string>();
  for (const city of cities) {
    if (seen.has(city.slug)) {
      throw new Error(`Duplicate babysitter city slug: ${city.slug}`);
    }
    seen.add(city.slug);
    for (const slug of city.nearbyCitySlugs) {
      if (!seen.has(slug) && !CITY_BY_SLUG.has(slug)) {
        throw new Error(`Unsupported nearby city ${slug} on ${city.slug}`);
      }
      if (slug === city.slug) {
        throw new Error(`City ${city.slug} cannot link to itself`);
      }
    }
  }
}

assertCityConfig(BABYSITTER_CITIES);

export function getBabysitterCity(slug: string): BabysitterCity | null {
  if (!CITY_BY_SLUG.has(slug as BabysitterCitySlug)) return null;
  return CITY_BY_SLUG.get(slug as BabysitterCitySlug) ?? null;
}

export function getNearbyBabysitterCities(city: BabysitterCity): BabysitterCity[] {
  return city.nearbyCitySlugs.flatMap((slug) => {
    const found = CITY_BY_SLUG.get(slug);
    return found ? [found] : [];
  });
}

export function babysitterCityPath(slug: BabysitterCitySlug): `/${string}` {
  return `/babysitter/${slug}`;
}

export function babysitterCityCanonical(slug: BabysitterCitySlug): string {
  return `${SITE_URL}/babysitter/${slug}`;
}

export function babysitterCityStaticParams(): { city: BabysitterCitySlug }[] {
  return BABYSITTER_CITIES.map((city) => ({ city: city.slug }));
}

export function babysitterCityMetadata(city: BabysitterCity): Metadata {
  const canonical = babysitterCityCanonical(city.slug);
  return {
    title: city.title,
    description: city.description,
    alternates: {
      canonical
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true
      }
    },
    openGraph: {
      title: city.title,
      description: city.description,
      url: canonical,
      siteName: "AnyNanny",
      locale: "he_IL",
      type: "website",
      images: [
        {
          url: GENERAL_ACQUISITION_HERO_URL,
          width: GENERAL_ACQUISITION_HERO_WIDTH,
          height: GENERAL_ACQUISITION_HERO_HEIGHT,
          alt: city.heroAlt
        }
      ]
    },
    twitter: {
      card: "summary_large_image",
      title: city.title,
      description: city.description,
      images: [GENERAL_ACQUISITION_HERO_URL]
    }
  };
}

export function buildBabysitterCityStructuredData(city: BabysitterCity) {
  const url = babysitterCityCanonical(city.slug);
  const crumbName = `בייביסיטר ${city.inCityHe}`;
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
        "@id": `${url}#webpage`,
        url,
        name: city.title,
        description: city.description,
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
          },
          {
            "@type": "ListItem",
            position: 3,
            name: crumbName,
            item: url
          }
        ]
      }
    ]
  };
}
