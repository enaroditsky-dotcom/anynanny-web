import type { MetadataRoute } from "next";
import { PUBLIC_SITEMAP_URL } from "@/lib/seo/public-sitemap";

/**
 * Public crawl rules only. Private routes stay protected by the app,
 * not by robots.txt.
 */
export function buildPublicRobots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/"
    },
    sitemap: PUBLIC_SITEMAP_URL
  };
}
