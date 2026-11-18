import type { MetadataRoute } from "next";
import { buildPublicRobots } from "@/lib/seo/public-robots";

export default function robots(): MetadataRoute.Robots {
  return buildPublicRobots();
}
