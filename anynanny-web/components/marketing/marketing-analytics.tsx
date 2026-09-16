"use client";

import { Analytics } from "@vercel/analytics/react";
import { prepareMarketingAnalyticsUrl } from "@/lib/marketing/analytics";

export function MarketingAnalytics() {
  return (
    <Analytics
      debug={false}
      beforeSend={(event) => {
        const url = prepareMarketingAnalyticsUrl(event.url);
        if (!url) return null;
        return { ...event, url };
      }}
    />
  );
}
