import { MARKETING_CHAPTERS, type MarketingChapterId } from "@/lib/marketing/chapters";
import { ANYNANNY_SUPPORT_EMAIL } from "@/lib/legal/contact";

export const COMING_SOON_LABEL = "בקרוב";
export const MARKETING_SITE_NAV_ID = "marketing-site-nav";
export const APP_ENTRY_HREF = "/login";
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
    destination: { kind: "soon" }
  }
];

export const DEFAULT_OPEN_NAV_IDS = ["org"] as const;

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
