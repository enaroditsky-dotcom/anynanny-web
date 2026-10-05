import type { MetadataRoute } from "next";

/** Canonical production origin. Sitemap URLs are absolute so they do not follow the request host. */
export const SITE_ORIGIN = "https://www.anynanny.org";

export type PublicSitemapChangeFrequency = NonNullable<
  MetadataRoute.Sitemap[number]["changeFrequency"]
>;

export type PublicSitemapPage = {
  path: "/" | `/${string}`;
  changeFrequency: PublicSitemapChangeFrequency;
  priority: number;
};

export const PUBLIC_HOME_PAGE: PublicSitemapPage = {
  path: "/",
  changeFrequency: "weekly",
  priority: 1
};

/**
 * Indexable SEO landing pages.
 * Add a path here when the page exists, for example:
 * /jobs/60-plus, /jobs/extra-income, /babysitter/haifa.
 */
export const SEO_LANDING_PAGES: readonly PublicSitemapPage[] = [
  {
    path: "/jobs/students",
    changeFrequency: "weekly",
    priority: 0.8
  },
  {
    path: "/babysitter",
    changeFrequency: "weekly",
    priority: 0.9
  }
];

/** Public legal pages linked from the marketing site. None of these set noindex. */
export const PUBLIC_LEGAL_PAGES: readonly PublicSitemapPage[] = [
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/delete-account", changeFrequency: "yearly", priority: 0.2 }
];

export const PUBLIC_SITEMAP_PAGES: readonly PublicSitemapPage[] = [
  PUBLIC_HOME_PAGE,
  ...SEO_LANDING_PAGES,
  ...PUBLIC_LEGAL_PAGES
];

export function absoluteSiteUrl(path: PublicSitemapPage["path"]): string {
  if (path === "/") return `${SITE_ORIGIN}/`;
  return `${SITE_ORIGIN}${path}`;
}

export const PUBLIC_SITEMAP_URL = `${SITE_ORIGIN}/sitemap.xml`;

/**
 * lastModified is omitted. The repo has no per-page publish timestamp,
 * and a month label such as "אוגוסט 2026" is not a specific date.
 */
export function buildPublicSitemap(): MetadataRoute.Sitemap {
  return PUBLIC_SITEMAP_PAGES.map((page) => ({
    url: absoluteSiteUrl(page.path),
    changeFrequency: page.changeFrequency,
    priority: page.priority
  }));
}
