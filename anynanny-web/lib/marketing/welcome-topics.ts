import {
  MARKETING_COMMUNITY,
  MARKETING_FOUNDER,
  MARKETING_LIFE,
  MARKETING_RESPECT,
  MARKETING_SITTERS
} from "@/lib/marketing/copy";

export type WelcomeTopic = {
  slug: "meet" | "life" | "trust" | "preview" | "respect" | "sitters";
  title: string;
  description: string;
  heading: string;
  headingLines?: readonly string[];
  lead?: string;
  paragraphs: readonly string[];
  closing?: string;
  closingLines?: readonly string[];
  artSrc?: string;
  artAlt?: string;
  demo?: boolean;
};

export const WELCOME_TOPICS: readonly WelcomeTopic[] = [
  {
    slug: "meet",
    title: "בואו להכיר את AnyNanny",
    description: MARKETING_FOUNDER.paragraphs[1],
    heading: MARKETING_FOUNDER.heading,
    paragraphs: MARKETING_FOUNDER.paragraphs,
    closing: MARKETING_FOUNDER.closing,
    artSrc: MARKETING_FOUNDER.artSrc,
    artAlt: MARKETING_FOUNDER.artAlt
  },
  {
    slug: "life",
    title: "פשוט למצוא זמן לחיים",
    description: MARKETING_LIFE.paragraphs[0],
    heading: MARKETING_LIFE.heading,
    paragraphs: MARKETING_LIFE.paragraphs,
    closing: `${MARKETING_LIFE.closingPrefix}AnyNanny${MARKETING_LIFE.closingSuffix}`,
    artSrc: MARKETING_LIFE.artSrc,
    artAlt: MARKETING_LIFE.artAlt
  },
  {
    slug: "trust",
    title: "להכיר ולהיות בטוחים",
    description: MARKETING_COMMUNITY.paragraphs[0],
    heading: "להכיר ולהיות בטוחים",
    lead: MARKETING_COMMUNITY.heading,
    paragraphs: MARKETING_COMMUNITY.paragraphs,
    closing: MARKETING_COMMUNITY.closing,
    artSrc: MARKETING_COMMUNITY.artSrc,
    artAlt: MARKETING_COMMUNITY.artAlt
  },
  {
    slug: "preview",
    title: "בואו נציץ פנימה",
    description: MARKETING_FOUNDER.paragraphs[2],
    heading: "בואו נציץ פנימה",
    paragraphs: [MARKETING_FOUNDER.paragraphs[2]],
    demo: true
  },
  {
    slug: "sitters",
    title: MARKETING_SITTERS.heading,
    description: MARKETING_SITTERS.paragraphs[0],
    heading: MARKETING_SITTERS.heading,
    headingLines: MARKETING_SITTERS.headingLines,
    paragraphs: MARKETING_SITTERS.paragraphs,
    closingLines: MARKETING_SITTERS.closingLines,
    artSrc: MARKETING_SITTERS.artSrc,
    artAlt: MARKETING_SITTERS.artAlt
  },
  {
    slug: "respect",
    title: "כבוד וביטחון מתחילים בהדדיות",
    description: MARKETING_RESPECT.paragraphs[0],
    heading: MARKETING_RESPECT.heading,
    paragraphs: MARKETING_RESPECT.paragraphs,
    closing: MARKETING_RESPECT.closingLines.join(" "),
    artSrc: MARKETING_RESPECT.artSrc,
    artAlt: MARKETING_RESPECT.artAlt
  }
];

const TOPICS_BY_SLUG = new Map(WELCOME_TOPICS.map((topic) => [topic.slug, topic]));

export function welcomeTopicBySlug(slug: string): WelcomeTopic | null {
  return TOPICS_BY_SLUG.get(slug as WelcomeTopic["slug"]) ?? null;
}

export function welcomeTopicPath(slug: WelcomeTopic["slug"]): string {
  return `/marketing/${slug}`;
}

export function welcomeTopicCanonical(slug: WelcomeTopic["slug"]): string {
  return `https://www.anynanny.org/marketing/${slug}`;
}
