import { MARKETING_CHAPTERS, type MarketingChapterId } from "@/lib/marketing/chapters";
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
    id: "org",
    label: "AnyNanny.org",
    icon: "globe",
    children: ORG_NAV_CHAPTERS
  },
  {
    type: "link",
    id: "app",
    label: "AnyNanny.app",
    icon: "app",
    destination: { kind: "href", href: APP_ENTRY_HREF }
  },
  {
    type: "accordion",
    id: "community",
    label: "קהילת AnyNanny",
    icon: "users",
    children: [
      {
        type: "accordion",
        id: "forum",
        label: "פורום AnyNanny",
        icon: "messages",
        children: [
          {
            type: "link",
            id: "forum-parents",
            label: "הורים",
            icon: "parent",
            destination: { kind: "soon" }
          },
          {
            type: "link",
            id: "forum-sitters",
            label: "בייביסיטריות",
            icon: "sitter",
            destination: { kind: "soon" }
          }
        ]
      },
      {
        type: "accordion",
        id: "marketplace",
        label: "AnyNanny Marketplace",
        icon: "store",
        children: [
          {
            type: "link",
            id: "marketplace-buy",
            label: "AnyNanny BUY",
            icon: "buy",
            destination: { kind: "soon" }
          },
          {
            type: "link",
            id: "marketplace-giveaway",
            label: "למסירה / מכירה",
            icon: "giveaway",
            destination: { kind: "soon" }
          }
        ]
      }
    ]
  },
  {
    type: "accordion",
    id: "info",
    label: "מידע ושירות",
    icon: "book",
    children: [
      {
        type: "link",
        id: "knowledge",
        label: "מרכז ידע",
        icon: "book",
        destination: { kind: "soon" }
      },
      {
        type: "link",
        id: "safety",
        label: "בטיחות ואמון",
        icon: "shield",
        destination: { kind: "chapter", chapterId: "respect" }
      },
      {
        type: "link",
        id: "whats-new",
        label: "מה חדש ב־AnyNanny",
        icon: "sparkles",
        destination: { kind: "soon" }
      },
      {
        type: "link",
        id: "support",
        label: "עזרה ותמיכה",
        icon: "help",
        destination: { kind: "href", href: SUPPORT_MAILTO }
      }
    ]
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
  if (destination.kind === "chapter") return `#${destination.chapterId}`;
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
