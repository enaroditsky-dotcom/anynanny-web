import type { MetadataRoute } from "next";
import { BABYSITTER_CITIES, babysitterCityCanonical } from "@/lib/marketing/babysitter-cities";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://www.anynanny.org",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://www.anynanny.org/jobs/students",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: "https://www.anynanny.org/babysitter",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: "https://www.anynanny.org/app",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    ...BABYSITTER_CITIES.map((city) => ({
      url: babysitterCityCanonical(city.slug),
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
