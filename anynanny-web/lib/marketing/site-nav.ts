import {
  MARKETING_CHAPTERS,
  storyChapterHref,
  type MarketingChapterId
} from "@/lib/marketing/chapters";
import { ANYNANNY_SUPPORT_EMAIL } from "@/lib/legal/contact";
import { readStudentJobsUtm } from "@/lib/marketing/student-jobs";

export const COMING_SOON_LABEL = "בקרוב";
export const IPHONE_APP_STORE_URL = "https://apps.apple.com/il/app/anynanny/id6813214477";

/** App Store listing with the five campaign params. Other stores stay unchanged. */
export function withStoreCampaign(href: string, search: string | URLSearchParams = ""): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  if (url.origin !== "https://apps.apple.com") return href;
  readStudentJobsUtm(search).forEach((value, key) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}
export const MARKETING_SITE_NAV_ID = "marketing-site-nav";
/** www App Store / Web App landing. Login and signup leave through the application host. */
export const APP_ENTRY_HREF = "/app";
export const SUPPORT_MAILTO = `mailto:${ANYNANNY_SUPPORT_EMAIL}`;

export type SiteNavIconName =
  | "home"
  | "globe"
  | "app"
  | "users"
  | "messages"
  | "store"
  | "book"
  | "shield"
  | "sparkles"
  | "help"
  | "android"
  | "iphone"
  | "parent"
  | "sitter"
  | "buy"
  | "giveaway";

export type SiteNavDestination =
  | { kind: "chapter"; chapterId: MarketingChapterId }
  | { kind: "href"; href: string }
  | { kind: "soon" };

export type SiteNavLink = {
  type: "link";
  id: string;
  label: string;
  icon?: SiteNavIconName;
  destination: SiteNavDestination;
  tone?: "offer";
};

export type SiteNavAccordion = {
  type: "accordion";
  id: string;
  label: string;
  icon: SiteNavIconName;
  children: SiteNavNode[];
};

export type SiteNavNode = SiteNavAccordion | SiteNavLink;

export const ORG_NAV_CHAPTERS: SiteNavLink[] = MARKETING_CHAPTERS.map((chapter) => ({
  type: "link",
  id: `chapter-${chapter.id}`,
  label: chapter.navLabel,
  destination: { kind: "chapter", chapterId: chapter.id }
}));

export const SITE_NAV_ITEMS: SiteNavNode[] = [
  {
    type: "link",
    id: "home",
    label: "דף הבית",
    icon: "home",
    destination: { kind: "href", href: "/" }
  },
  {
    type: "link",
    id: "find-babysitter",
    label: "מציאת בייביסיטר",
    icon: "parent",
    destination: { kind: "href", href: "/parents" }
  },
  {
    type: "link",
    id: "babysitter-work",
    label: "עבודה כבייביסיטרית",
    icon: "sitter",
    destination: { kind: "href", href: "/babysitter" }
  },
  {
    type: "accordion",
    id: "explore",
    label: "להכיר את AnyNanny",
    icon: "book",
    children: [
      {
        type: "link",
        id: "our-story",
        label: "הסיפור שלנו",
        icon: "book",
        destination: { kind: "href", href: "/story" }
      },
      {
        type: "link",
        id: "trust",
        label: "להכיר ולהיות בטוחים",
        icon: "shield",
        destination: { kind: "href", href: "/marketing/trust" }
      },
      {
        type: "link",
        id: "respect",
        label: "כבוד והדדיות",
        icon: "users",
        destination: { kind: "href", href: "/marketing/respect" }
      },
      {
        type: "link",
        id: "preview",
        label: "בואו נציץ פנימה",
        icon: "sparkles",
        destination: { kind: "href", href: "/marketing/preview" }
      }
    ]
  },
  {
    type: "link",
    id: "offers",
    label: "ANYNANNY-מבצעים וקופונים",
    icon: "sparkles",
    tone: "offer",
    destination: { kind: "soon" }
  },
  {
    type: "link",
    id: "app-entry",
    label: "לכניסה ולהורדת האפליקציה",
    icon: "app",
    destination: { kind: "href", href: APP_ENTRY_HREF }
  }
];

export const SITE_NAV_DOWNLOADS: SiteNavLink[] = [
  {
    type: "link",
    id: "download-android",
    label: "Android",
    icon: "android",
    destination: { kind: "soon" }
  },
  {
    type: "link",
    id: "download-iphone",
    label: "iPhone",
    icon: "iphone",
    destination: { kind: "href", href: IPHONE_APP_STORE_URL }
  }
];

export const DEFAULT_OPEN_NAV_IDS = [] as const;

export function destinationHref(destination: SiteNavDestination): string | null {
  if (destination.kind === "chapter") return storyChapterHref(destination.chapterId);
  if (destination.kind === "href") return destination.href;
  return null;
}

export function isProtectedFaqHref(href: string): boolean {
  return (
    href === "/parent/faq" ||
    href === "/sitter/faq" ||
    href.startsWith("/parent/faq/") ||
    href.startsWith("/sitter/faq/")
  );
}

export function collectDestinations(nodes: SiteNavNode[]): SiteNavDestination[] {
  const found: SiteNavDestination[] = [];
  for (const node of nodes) {
    if (node.type === "link") {
      found.push(node.destination);
      continue;
    }
    found.push(...collectDestinations(node.children));
  }
  return found;
}
