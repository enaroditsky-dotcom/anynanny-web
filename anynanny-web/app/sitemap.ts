import type { MetadataRoute } from "next";
import { buildPublicSitemap } from "@/lib/seo/public-sitemap";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildPublicSitemap();
}
