import { GENERAL_ACQUISITION_DESCRIPTION, SITE_URL } from "@/lib/marketing/general-acquisition";

export const MARKETING_HOME_CANONICAL = `${SITE_URL}/`;

export const MARKETING_HOME_TITLE = "AnyNanny | מוצאים בייביסיטר או עבודה כבייביסיטר";

export const MARKETING_HOME_DESCRIPTION = GENERAL_ACQUISITION_DESCRIPTION;

export const MARKETING_HOME_OPEN_APP_LABEL = "כבר נרשמתם? פתחו את AnyNanny";

export const MARKETING_HOME_LINKS = [
  { href: "/parents", label: "מחפשים בייביסיטר?" },
  { href: "/babysitter", label: "רוצה לעבוד כבייביסיטר?" },
  { href: "/jobs/students", label: "עבודה בבייביסיטר לסטודנטיות" }
] as const;
