import type { NextConfig } from "next";
import { NOINDEX_ROBOTS_VALUE, noindexHeaderRoutes } from "./lib/seo/private-index";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" }
        ]
      },
      {
        source: "/",
        has: [{ type: "host", value: "app.anynanny.org" }],
        headers: [{ key: "X-Robots-Tag", value: NOINDEX_ROBOTS_VALUE }]
      },
      ...noindexHeaderRoutes()
    ];
  }
};

export default nextConfig;
